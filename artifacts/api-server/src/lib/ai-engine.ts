import {
  EXPLANATION_ENGINE_PROMPT,
  INTERACTIVE_EXERCISES_PROMPT,
  LEARNER_SAFE_OUTPUT_RULES,
  DALEEL_TUTOR_PROMPT,
} from "./ai-prompts";
import {
  callDeepSeekTextModelWithRetry,
  DeepSeekProviderError,
  type ChatMessage,
} from "./ai-provider";
import {
  assertGroundedNodeIds,
  formatRetrievedContext,
  KnowledgeGroundingError,
  retrieveGroundedKnowledge,
  type RetrievalContext,
} from "./rag";
import { normalizeFunctionSectionTitle } from "./function-section-titles";

const MAX_CONTENT_LENGTH = 50_000;
const MAX_EXERCISES = 10;

export type ExplanationRequest = {
  lessonTitle: string;
  content: string;
  level?: string;
  subject?: string;
  curriculumYear?: string;
};

export type ExplanationSection = {
  title: string;
  content: string;
  key_points: string[];
  example?: string;
};

export type ExplanationResult = {
  lesson_title: string;
  explanation_sections: ExplanationSection[];
  key_points: string[];
  examples: string[];
  sourceNodeIds: string[];
  grounding: RetrievalContext["grounding"];
};

export type ExerciseType = "mcq" | "true_false" | "practical";

export type ExerciseSection = {
  id: string;
  title: string;
  points: number;
  prompt: string;
};

type GeneratedExercisePaper = {
  lesson_title: string;
  title: string;
  prompt: string;
  hint: string;
  solution: string;
  format: "comprehensive_function" | "comprehensive_science";
  total_points: number;
  sections: ExerciseSection[];
  sourceNodeIds: string[];
  grounding: RetrievalContext["grounding"];
};

export type ExercisesRequest = {
  lessonTitle: string;
  content: string;
  level?: string;
  subject?: string;
  curriculumYear?: string;
  exerciseCount: number;
  exerciseTypes: ExerciseType[];
};

export type ExercisesResult = {
  lesson_title: string;
  title: string;
  prompt: string;
  hint: string;
  format: "comprehensive_function" | "comprehensive_science";
  total_points: number;
  sections: ExerciseSection[];
  sourceNodeIds: string[];
  grounding: RetrievalContext["grounding"];
};

export type DaleelCanvasCommand = {
  step: number;
  type: "write" | "highlight" | "erase";
  content: string;
  coordinates: { x: number; y: number };
};

export type DaleelSummaryData = {
  title: string;
  key_takeaways: string[];
  official_stamp_applied: boolean;
};

export type DaleelRequest = {
  lessonTitle: string;
  content: string;
  question: string;
  level?: string;
  subject?: string;
  curriculumYear?: string;
  highlightedRegion?: { x: number; y: number; width: number; height: number };
  mastery: boolean;
};

export type DaleelResult = {
  speech_text: string;
  canvas_commands: DaleelCanvasCommand[];
  summary_data: DaleelSummaryData;
  sourceNodeIds: string[];
  grounding: RetrievalContext["grounding"];
};

export class AiEngineError extends Error {
  readonly code: "invalid_model_output" | "provider_error";

  constructor(
    message: string,
    code: "invalid_model_output" | "provider_error",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AiEngineError";
    this.code = code;
  }
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced) return fenced;

  const start = text.indexOf("{");
  if (start < 0) throw new Error("AI provider returned non-JSON content");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error("AI provider returned incomplete JSON");
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function buildUserContent(
  request: ExplanationRequest | ExercisesRequest,
  retrieval: RetrievalContext,
): string {
  return [
    `عنوان الدرس: ${request.lessonTitle}`,
    `مستوى الطالب: ${request.level || "التعليم الثانوي"}`,
    `المادة: ${request.subject || "تُستنتج من عنوان الدرس والمصادر"}`,
    `السنة الدراسية: ${request.curriculumYear || "تُستنتج من الطلب والمصادر"}`,
    "المحتوى الذي أدخله المتعلم (يُستخدم كإشارة للبحث، وليس كمصدر وحيد):",
    "<learner_content>",
    request.content,
    "</learner_content>",
    "المقاطع المصدرية المسترجعة من قاعدة ChromaDB هي المرجع المعتمد للتوليد:",
    "<chromadb_context>",
    formatRetrievedContext(retrieval.documents),
    "</chromadb_context>",
  ].join("\n");
}

async function retrieveForAi(
  request: ExplanationRequest | ExercisesRequest,
): Promise<RetrievalContext> {
  const query = [request.lessonTitle, request.content.slice(0, 4_000)]
    .filter(Boolean)
    .join("\n");
  const where =
    request.subject || request.curriculumYear
      ? {
          ...(request.subject ? { subject: request.subject } : {}),
          ...(request.curriculumYear
            ? { curriculum_year: request.curriculumYear }
            : {}),
        }
      : undefined;
  return retrieveGroundedKnowledge(query, {
    nResults: "exerciseCount" in request ? 20 : 8,
    where,
  });
}

async function generateJson<T>(
  messages: ChatMessage[],
  label: string,
  parse: (payload: Record<string, unknown>) => T,
  options: { maxOutputTokens?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const content = await callDeepSeekTextModelWithRetry(
        messages,
        { temperature: 0.2, maxOutputTokens: options.maxOutputTokens ?? 2600, jsonMode: true },
        { maxAttempts: 2, baseDelayMs: 500 },
      );
      const parsed = JSON.parse(extractJsonObject(content)) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`${label} returned a JSON value instead of an object`);
      }
      return parse(parsed as Record<string, unknown>);
    } catch (error) {
      lastError = error;
      if (error instanceof KnowledgeGroundingError) {
        throw error;
      }
      if (error instanceof DeepSeekProviderError && !error.retryable) {
        throw error;
      }
      if (attempt === 2) break;
    }
  }
  if (lastError instanceof DeepSeekProviderError) {
    throw lastError;
  }
  throw new AiEngineError(
    `${label} failed after retrying`,
    "invalid_model_output",
    { cause: lastError },
  );
}

function parseExplanation(
  payload: Record<string, unknown>,
  retrieval: RetrievalContext,
): ExplanationResult {
  const lessonTitle = asText(payload.lesson_title);
  const sections = Array.isArray(payload.explanation_sections)
    ? payload.explanation_sections
        .map((section): ExplanationSection | null => {
          if (!section || typeof section !== "object") return null;
          const value = section as Record<string, unknown>;
          const title = asText(value.title);
          const content = asText(value.content);
          const keyPoints = asStringArray(value.key_points);
          if (!title || !content || !keyPoints.length) return null;
          const example = asText(value.example);
          return {
            title,
            content,
            key_points: keyPoints.slice(0, 8),
            ...(example ? { example } : {}),
          };
        })
        .filter((section): section is ExplanationSection => section !== null)
        .slice(0, 8)
    : [];
  const keyPoints = asStringArray(payload.key_points).slice(0, 12);
  const examples = asStringArray(payload.examples).slice(0, 8);
  const sourceNodeIds = assertGroundedNodeIds(payload.sourceNodeIds, retrieval);

  if (!lessonTitle || sections.length < 2 || !keyPoints.length) {
    throw new AiEngineError(
      "Explanation response does not match the structured contract",
      "invalid_model_output",
    );
  }
  return {
    lesson_title: lessonTitle,
    explanation_sections: sections,
    key_points: keyPoints,
    examples,
    sourceNodeIds,
    grounding: retrieval.grounding,
  };
}

function parseExercises(
  payload: Record<string, unknown>,
  retrieval: RetrievalContext,
): GeneratedExercisePaper {
  const lessonTitle = asText(payload.lesson_title);
  const title = asText(payload.title);
  const prompt = asText(payload.prompt);
  const hint = asText(payload.hint);
  const solution = asText(payload.solution);
  const format =
    payload.format === "comprehensive_function" || payload.format === "comprehensive_science"
      ? payload.format
      : null;
  const rawSections = Array.isArray(payload.sections) ? payload.sections : [];
  const sections = rawSections
    .map((section): ExerciseSection | null => {
      if (!section || typeof section !== "object") return null;
      const value = section as Record<string, unknown>;
      const sectionTitle = asText(value.title);
      const sectionPrompt = asText(value.prompt);
      const points = Number(value.points);
      if (!sectionTitle || !sectionPrompt || !Number.isFinite(points) || points <= 0) return null;
      return {
        id: asText(value.id) || `section-${rawSections.indexOf(section) + 1}`,
        title: sectionTitle,
        points,
        prompt: sectionPrompt,
      };
    })
    .filter((section): section is ExerciseSection => section !== null)
    .slice(0, 10)
    .map((section) => ({
      ...section,
      title:
        format === "comprehensive_function"
          ? normalizeFunctionSectionTitle(section.id, section.title)
          : section.title,
    }));
  const totalPoints = Number(payload.total_points ?? payload.totalPoints);
  const sourceNodeIds = assertGroundedNodeIds(payload.sourceNodeIds, retrieval);

  if (
    !lessonTitle ||
    !title ||
    !prompt ||
    !hint ||
    !solution ||
    !format ||
    sections.length < 5 ||
    !Number.isFinite(totalPoints) ||
    totalPoints <= 0 ||
    totalPoints > 20
  ) {
    throw new AiEngineError(
      "Comprehensive exercise paper does not match the structured contract",
      "invalid_model_output",
    );
  }
  return {
    lesson_title: lessonTitle,
    title,
    prompt,
    hint,
    solution,
    format,
    total_points: totalPoints,
    sections,
    sourceNodeIds,
    grounding: retrieval.grounding,
  };
}

function normalizedCoordinate(value: unknown): number | null {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1 ? coordinate : null;
}

function parseDaleel(
  payload: Record<string, unknown>,
  mastery: boolean,
  retrieval: RetrievalContext,
): DaleelResult {
  const speechText = asText(payload.speech_text);
  const commands = Array.isArray(payload.canvas_commands)
    ? payload.canvas_commands
        .map((command, index): DaleelCanvasCommand | null => {
          if (!command || typeof command !== "object") return null;
          const value = command as Record<string, unknown>;
          const coordinates = value.coordinates;
          if (!coordinates || typeof coordinates !== "object") return null;
          const point = coordinates as Record<string, unknown>;
          const x = normalizedCoordinate(point.x);
          const y = normalizedCoordinate(point.y);
          const type = value.type;
          const content = asText(value.content);
          if (
            (type !== "write" && type !== "highlight" && type !== "erase")
            || x === null
            || y === null
            || !content
          ) {
            return null;
          }
          const stepValue = Number(value.step);
          return {
            step: Number.isInteger(stepValue) && stepValue > 0 ? stepValue : index + 1,
            type,
            content: content.slice(0, 240),
            coordinates: { x, y },
          };
        })
        .filter((command): command is DaleelCanvasCommand => command !== null)
        .sort((a, b) => a.step - b.step)
        .slice(0, 24)
    : [];
  const rawSummary = payload.summary_data;
  const summary = rawSummary && typeof rawSummary === "object"
    ? rawSummary as Record<string, unknown>
    : {};
  const title = asText(summary.title);
  const keyTakeaways = asStringArray(summary.key_takeaways).slice(0, 6);
  const officialStampApplied = summary.official_stamp_applied === true;
  if (!speechText || !commands.length) {
    throw new AiEngineError("Daleel response does not match the structured contract", "invalid_model_output");
  }
  if (mastery && (!title || keyTakeaways.length < 3 || !officialStampApplied)) {
    throw new AiEngineError("Daleel mastery summary is incomplete", "invalid_model_output");
  }
  return {
    speech_text: speechText,
    canvas_commands: commands,
    summary_data: {
      title: mastery ? title : "",
      key_takeaways: mastery ? keyTakeaways : [],
      official_stamp_applied: mastery && officialStampApplied,
    },
    sourceNodeIds: assertGroundedNodeIds(payload.sourceNodeIds, retrieval),
    grounding: retrieval.grounding,
  };
}

export async function generateExplanation(
  request: ExplanationRequest,
): Promise<ExplanationResult> {
  const retrieval = await retrieveForAi(request);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        EXPLANATION_ENGINE_PROMPT,
        LEARNER_SAFE_OUTPUT_RULES,
        "اعتمد على مقاطع ChromaDB المصدرية فقط. لا تضف معلومة لا تثبتها هذه المقاطع.",
        "فرّق بين نوع المصدر: استخدم lesson/summary/concept/reference لبناء الفهم، واستخدم exercise/assessment/solution لبناء التطبيق والتقييم. لا تعامل program أو أي مصدر غير دراسي كمرجع لقانون أو معلومة.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        buildUserContent(request, retrieval),
        'أعد الشكل التالي فقط، واختر sourceNodeIds من المعرّفات الظاهرة في chromadb_context: {"lesson_title":"...","explanation_sections":[{"title":"...","content":"...","key_points":["..."],"example":"..."}],"key_points":["..."],"examples":["..."],"sourceNodeIds":["node-id"]}',
      ].join("\n\n"),
    },
  ];
  return generateJson(messages, "Explanation engine", (payload) => parseExplanation(payload, retrieval));
}

export async function generateExercises(
  request: ExercisesRequest,
): Promise<ExercisesResult> {
  const retrieval = await retrieveForAi(request);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        INTERACTIVE_EXERCISES_PROMPT,
        LEARNER_SAFE_OUTPUT_RULES,
        "اعتمد على مقاطع ChromaDB المصدرية فقط. لا تضف قانونًا أو رقمًا أو مثالًا لا تثبته هذه المقاطع.",
        "فرّق بين نوع المصدر: استخرج المفهوم من lesson/summary/concept/reference، وابنِ المطلوبات والأعداد من exercise/assessment/solution. لا تستخدم program كمصدر لإجابة علمية.",
        "أنشئ ورقة واحدة متماسكة، لا قائمة أسئلة منفصلة ولا اختيارًا من متعدد ولا صح/خطأ.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        buildUserContent(request, retrieval),
        'أعد الشكل التالي فقط، واختر sourceNodeIds من المعرّفات الظاهرة في chromadb_context: {"lesson_title":"...","title":"دراسة شاملة في الدالة","prompt":"سياق الورقة والمعطيات دون حل","hint":"تلميح مختصر","solution":"الحل النموذجي للاستخدام الداخلي فقط","format":"comprehensive_function","total_points":20,"sections":[{"id":"domain","title":"D_f · مجموعة التعريف | Domaine","points":2,"prompt":"مطلوب قابل للحل على الورق"},{"id":"limits","title":"lim · النهايات | Limites","points":3,"prompt":"..."},{"id":"derivative","title":"f′ · الاشتقاق | Dérivée","points":3,"prompt":"..."},{"id":"variations","title":"Δf · اتجاه التغيرات | Variations","points":3,"prompt":"..."},{"id":"equations","title":"E_f · المعادلات والمتراجحات | Équations · Inéquations","points":2,"prompt":"..."},{"id":"graph","title":"C_f · التمثيل البياني | Courbe","points":5,"prompt":"..."},{"id":"synthesis","title":"Σ · تركيب الدراسة | Synthèse","points":2,"prompt":"..."}],"sourceNodeIds":["node-id"]}',
      ].join("\n\n"),
    },
  ];
  return generateJson(
    messages,
    "Exercises engine",
    (payload) => {
      const paper = parseExercises(payload, retrieval);
      return {
        lesson_title: paper.lesson_title,
        title: paper.title,
        prompt: paper.prompt,
        hint: paper.hint,
        format: paper.format,
        total_points: paper.total_points,
        sections: paper.sections,
        sourceNodeIds: paper.sourceNodeIds,
        grounding: paper.grounding,
      };
    },
    { maxOutputTokens: 4200 },
  );
}

export async function generateDaleelResponse(request: DaleelRequest): Promise<DaleelResult> {
  const retrieval = await retrieveGroundedKnowledge(
    [request.lessonTitle, request.question, request.content.slice(0, 4_000)]
      .filter(Boolean)
      .join("\n"),
    {
      nResults: 8,
      where:
        request.subject || request.curriculumYear
          ? {
              ...(request.subject ? { subject: request.subject } : {}),
              ...(request.curriculumYear
                ? { curriculum_year: request.curriculumYear }
                : {}),
            }
          : undefined,
    },
  );
  const region = request.highlightedRegion
    ? `منطقة التحديد: x=${request.highlightedRegion.x.toFixed(3)}, y=${request.highlightedRegion.y.toFixed(3)}, العرض=${request.highlightedRegion.width.toFixed(3)}, الارتفاع=${request.highlightedRegion.height.toFixed(3)}`
    : "لا توجد منطقة محددة على السبورة.";
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [DALEEL_TUTOR_PROMPT, LEARNER_SAFE_OUTPUT_RULES].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `عنوان الدرس: ${request.lessonTitle}`,
        `مستوى الطالب: ${request.level || "التعليم الثانوي"}`,
        `المادة: ${request.subject || "تُستنتج من عنوان الدرس والمصادر"}`,
        `السنة الدراسية: ${request.curriculumYear || "تُستنتج من الطلب والمصادر"}`,
        `سؤال الطالب: ${request.question}`,
        region,
        `هل أتقن الطالب الموضوع؟ ${request.mastery ? "نعم" : "لا"}`,
        "<learner_content>",
        request.content,
        "</learner_content>",
        "مقاطع ChromaDB المصدرية المعتمدة:",
        "<chromadb_context>",
        formatRetrievedContext(retrieval.documents),
        "</chromadb_context>",
        'أعد JSON فقط بالصيغة المطلوبة، وأضف sourceNodeIds من معرّفات المقاطع المصدرية. يجب أن يحتوي canvas_commands على أمر واحد على الأقل.',
      ].join("\n"),
    },
  ];
  return generateJson(
    messages,
    "Daleel tutor",
    (payload) => parseDaleel(payload, request.mastery, retrieval),
  );
}

export function normalizeExplanationRequest(body: Record<string, unknown>): ExplanationRequest | null {
  const lessonTitle = asText(body.lesson_title ?? body.lessonTitle);
  const content = asText(body.content);
  const level = asText(body.level);
  const subject = asText(body.subject);
  const curriculumYear = asText(body.curriculum_year ?? body.curriculumYear);
  if (!lessonTitle || !content || content.length > MAX_CONTENT_LENGTH) return null;
  return {
    lessonTitle,
    content,
    ...(level ? { level } : {}),
    ...(subject ? { subject } : {}),
    ...(curriculumYear ? { curriculumYear } : {}),
  };
}

export function normalizeExercisesRequest(body: Record<string, unknown>): ExercisesRequest | null {
  const lessonTitle = asText(body.lesson_title ?? body.lessonTitle);
  const content = asText(body.content);
  const level = asText(body.level);
  const subject = asText(body.subject);
  const curriculumYear = asText(body.curriculum_year ?? body.curriculumYear);
  const requestedCount = Number(body.exercise_count ?? body.exerciseCount ?? 6);
  const exerciseCount = Number.isInteger(requestedCount)
    ? Math.max(1, Math.min(requestedCount, MAX_EXERCISES))
    : 0;
  const requestedTypes = body.exercise_types ?? body.exerciseTypes;
  const exerciseTypes = Array.isArray(requestedTypes)
    ? requestedTypes.filter(
        (type): type is ExerciseType =>
          type === "mcq" || type === "true_false" || type === "practical",
      )
    : (["mcq", "true_false", "practical"] satisfies ExerciseType[]);
  if (
    !lessonTitle ||
    !content ||
    content.length > MAX_CONTENT_LENGTH ||
    !exerciseCount ||
    !exerciseTypes.length
  ) {
    return null;
  }
  return {
    lessonTitle,
    content,
    exerciseCount,
    exerciseTypes: [...new Set(exerciseTypes)],
    ...(level ? { level } : {}),
    ...(subject ? { subject } : {}),
    ...(curriculumYear ? { curriculumYear } : {}),
  };
}

export function normalizeDaleelRequest(body: Record<string, unknown>): DaleelRequest | null {
  const lessonTitle = asText(body.lesson_title ?? body.lessonTitle);
  const content = asText(body.content);
  const question = asText(body.question);
  const level = asText(body.level);
  const subject = asText(body.subject);
  const curriculumYear = asText(body.curriculum_year ?? body.curriculumYear);
  const rawRegion = body.highlighted_region ?? body.highlightedRegion;
  let highlightedRegion: DaleelRequest["highlightedRegion"];
  if (rawRegion !== undefined) {
    if (!rawRegion || typeof rawRegion !== "object") return null;
    const region = rawRegion as Record<string, unknown>;
    const x = normalizedCoordinate(region.x);
    const y = normalizedCoordinate(region.y);
    const width = normalizedCoordinate(region.width);
    const height = normalizedCoordinate(region.height);
    if (x === null || y === null || width === null || height === null) return null;
    highlightedRegion = { x, y, width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) };
  }
  if (!lessonTitle || !content || content.length > MAX_CONTENT_LENGTH || !question) return null;
  return {
    lessonTitle,
    content,
    question,
    ...(level ? { level } : {}),
    ...(subject ? { subject } : {}),
    ...(curriculumYear ? { curriculumYear } : {}),
    ...(highlightedRegion ? { highlightedRegion } : {}),
    mastery: body.mastery === true,
  };
}