import { Router, type IRouter } from "express";
import { getUserId, listErrorBank } from "../lib/learning-store";
import {
  formatRetrievedContext,
  assertGroundedNodeIds,
  retrieveGroundedKnowledge,
  sourceDocumentsFrom,
  type KnowledgeDocument,
  type RetrievalContext,
  KnowledgeGroundingError,
} from "../lib/rag";
import {
  ACADEMIC_EXAM_PROMPT,
  ADAPTIVE_EXERCISE_PROMPT,
  CREATIVE_EXERCISE_TOPICS_PROMPT,
  EXERCISE_GENERATION_PROMPT,
  FRIENDLY_TUTOR_PROMPT,
  GROUNDED_CONTENT_RULES,
  INTERACTIVE_EXERCISES_PROMPT,
  LEARNER_SAFE_OUTPUT_RULES,
  LESSON_GENERATION_PROMPT,
} from "../lib/ai-prompts";
import {
  callDeepSeekTextModelWithRetry,
  DeepSeekProviderError,
} from "../lib/ai-provider";
import { normalizeFunctionSectionTitle } from "../lib/function-section-titles";

const router: IRouter = Router();

type GeneratedElement = {
  id: string;
  title: string;
  kind: "definition" | "example" | "graph" | "practice" | "recap";
  summary: string;
};

type GraphPoint = { x: number; y: number; label?: string };

type SourceDocument = { title: string; source: string; page: number };
type Grounding = RetrievalContext["grounding"];

type GeneratedLesson = {
  status: "generated";
  lessonTitle: string;
  sourceDocuments: Array<{ title: string; source: string; page: number }>;
  objective: string;
  elements: GeneratedElement[];
  explanation: string;
  highlight: string;
  graph: {
    type: "line" | "bar" | "none";
    title: string;
    xLabel: string;
    yLabel: string;
    points: GraphPoint[];
  };
  prompt: string;
  sourceNodeIds: string[];
  grounding: Grounding;
};

type GeneratedExercise = {
  status: "generated";
  lessonTitle: string;
  title: string;
  prompt: string;
  answer: string;
  hint: string;
  solution: string;
  sourceDocuments: SourceDocument[];
  sourceNodeIds: string[];
  grounding: Grounding;
  format?: "comprehensive_function" | "comprehensive_science";
  totalPoints?: number;
  sections?: Array<{
    id: string;
    title: string;
    points: number;
    prompt: string;
  }>;
  fallback?: boolean;
  fallbackMessage?: string;
};

type StudentPaper = {
  status: "generated";
  mode: "paper";
  lessonTitle: string;
  title: string;
  prompt: string;
  format: "comprehensive_function" | "comprehensive_science";
  totalPoints: number;
  sections: Array<{
    id: string;
    title: string;
    points: number;
    prompt: string;
  }>;
};

type StudentExercise = {
  status: "generated";
  lessonTitle: string;
  title: string;
  prompt: string;
  format?: "comprehensive_function" | "comprehensive_science";
  totalPoints?: number;
  sections?: Array<{
    id: string;
    title: string;
    points: number;
    prompt: string;
  }>;
};

function studentExerciseView(generated: GeneratedExercise): StudentExercise {
  return {
    status: generated.status,
    lessonTitle: generated.lessonTitle,
    title: generated.title,
    prompt: generated.prompt,
    ...(generated.format ? { format: generated.format } : {}),
    ...(generated.totalPoints !== undefined
      ? { totalPoints: generated.totalPoints }
      : {}),
    ...(generated.sections ? { sections: generated.sections } : {}),
  };
}

type GeneratedCreativeTopics = {
  status: "generated";
  mode: "creative_topic";
  agent: "exercises";
  lessonTitle: string;
  solutionSummary: string;
  ideas: Array<{
    title: string;
    approach: string;
    steps: string[];
    creativeTwist: string;
    expectedOutcome: string;
    sourceNodeIds: string[];
  }>;
  sourceDocuments: SourceDocument[];
  sourceNodeIds: string[];
  grounding: Grounding;
  fallback?: boolean;
  fallbackMessage?: string;
};

function extractJsonObject(text: string, label: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced) return fenced;

  const start = text.indexOf("{");
  if (start < 0) throw new Error(`${label} returned non-JSON content`);

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
  throw new Error(`${label} returned incomplete JSON`);
}

function extractGeneratedLesson(
  text: string,
): Omit<GeneratedLesson, "grounding"> {
  const candidate = extractJsonObject(text, "Lesson generator");
  const parsed = JSON.parse(candidate) as Partial<GeneratedLesson>;
  if (
    typeof parsed.lessonTitle !== "string" ||
    typeof parsed.objective !== "string" ||
    typeof parsed.explanation !== "string" ||
    typeof parsed.highlight !== "string" ||
    typeof parsed.prompt !== "string" ||
    !Array.isArray(parsed.sourceNodeIds) ||
    !Array.isArray(parsed.elements) ||
    !parsed.elements.length ||
    !parsed.graph ||
    typeof parsed.graph.title !== "string" ||
    !Array.isArray(parsed.graph.points)
  ) {
    throw new Error("Lesson generator returned an incomplete lesson");
  }
  const elements = parsed.elements
    .filter(
      (item): item is GeneratedElement =>
        Boolean(item) &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.summary === "string" &&
        ["definition", "example", "graph", "practice", "recap"].includes(
          item.kind,
        ),
    )
    .slice(0, 7);
  const requiredKinds: GeneratedElement["kind"][] = [
    "definition",
    "example",
    "graph",
    "practice",
    "recap",
  ];
  if (
    elements.length !== requiredKinds.length ||
    elements.some((element, index) => element.kind !== requiredKinds[index])
  ) {
    throw new Error(
      "Lesson generator returned an invalid academic lesson structure",
    );
  }
  return {
    status: "generated",
    lessonTitle: parsed.lessonTitle,
    sourceDocuments: Array.isArray(parsed.sourceDocuments)
      ? parsed.sourceDocuments
      : [],
    objective: parsed.objective,
    elements,
    explanation: parsed.explanation,
    highlight: parsed.highlight,
    graph: {
      type:
        parsed.graph.type === "bar"
          ? "bar"
          : parsed.graph.type === "none"
            ? "none"
            : "line",
      title: parsed.graph.title,
      xLabel:
        typeof parsed.graph.xLabel === "string" ? parsed.graph.xLabel : "",
      yLabel:
        typeof parsed.graph.yLabel === "string" ? parsed.graph.yLabel : "",
      points: parsed.graph.points
        .filter(
          (point): point is GraphPoint =>
            Boolean(point) &&
            typeof point.x === "number" &&
            typeof point.y === "number",
        )
        .slice(0, 12),
    },
    prompt: parsed.prompt,
    sourceNodeIds: parsed.sourceNodeIds.filter(
      (nodeId): nodeId is string => typeof nodeId === "string",
    ),
  };
}

async function generateLesson(
  lesson: string,
  level: string,
  subject: string,
  curriculumYear: string,
  activeConcept: string,
  attemptContext: string,
  retrieval: RetrievalContext,
) {
  const sourceText = formatRetrievedContext(retrieval.documents);
  const content = await callDeepSeekTextModelWithRetry(
    [
      {
        role: "system",
        content: [
          FRIENDLY_TUTOR_PROMPT,
          ACADEMIC_EXAM_PROMPT,
          LESSON_GENERATION_PROMPT,
          GROUNDED_CONTENT_RULES,
          LEARNER_SAFE_OUTPUT_RULES,
          "أنت مخطط درس عربي دقيق لمنصة تعليمية جزائرية. اجعل العناصر قصيرة، وكل عنصر يمثل خطوة واضحة في التعلم. أضف تمثيلًا بيانيًا رقميًا فقط عندما تسمح به البيانات المسترجعة، وإلا أعد graph.type = none. استخدم الأرقام العادية 1, 2, 3 فقط، ولا تستخدم الأرقام العربية الشرقية.",
          "هذه الواجهة تحتاج JSON فقط؛ أعد الحقول المطلوبة فقط، وضع الشرح والتمثيل التعليمي داخل الكائن ولا تضف أي نص خارجه.",
        ].join("\n\n"),
      },
      {
        role: "user",
        content: [
          `عنوان الدرس المطلوب: ${lesson}`,
          `مستوى الطالب: ${level || "غير محدد"}`,
           `المادة: ${subject || "غير محددة"}`,
           `السنة الدراسية: ${curriculumYear || "غير محددة"}`,
          `العنصر الحالي: ${activeConcept || "البداية"}`,
          `ملخص بنك الأخطاء: ${attemptContext || "لا توجد أخطاء محفوظة بعد"}`,
          "عقد المتجه المسترجعة من ChromaDB:",
          sourceText,
          'أعد الشكل التالي حرفيًا، وأضف sourceNodeIds بمعرّفات العقد المستخدمة: {"lessonTitle":"عنوان من المصادر","objective":"هدف قصير","elements":[{"id":"definition","title":"...","kind":"definition","summary":"..."},{"id":"example","title":"...","kind":"example","summary":"..."},{"id":"graph","title":"...","kind":"graph","summary":"..."},{"id":"practice","title":"...","kind":"practice","summary":"..."},{"id":"recap","title":"...","kind":"recap","summary":"..."}],"explanation":"شرح عربي قصير","highlight":"عبارة مهمة من الشرح","graph":{"type":"line","title":"عنوان الرسم","xLabel":"المحور الأفقي","yLabel":"المحور العمودي","points":[{"x":0,"y":0,"label":"..."}]},"prompt":"سؤال تفاعلي قصير","sourceNodeIds":["node-id"]}',
        ].join("\n"),
      },
    ],
    { temperature: 0.15, maxOutputTokens: 1800, jsonMode: true },
    { maxAttempts: 4, baseDelayMs: 1_000 },
  );
  const parsed = extractGeneratedLesson(content);
  return {
    ...parsed,
    sourceNodeIds: assertGroundedNodeIds(parsed.sourceNodeIds, retrieval),
    sourceDocuments: sourceDocumentsFrom(retrieval.documents),
    grounding: retrieval.grounding,
  };
}

async function generateExercise(
  lesson: string,
  level: string,
  subject: string,
  curriculumYear: string,
  activeConcept: string,
  attemptContext: string,
  forceComprehensive: boolean,
  retrieval: RetrievalContext,
): Promise<GeneratedExercise> {
  const sourceText = formatRetrievedContext(retrieval.documents);
  const generationRequest = [
    lesson,
    subject,
    activeConcept,
    attemptContext,
  ].join(" ");
  const isFunctionStudy = /دالة|دوال|الدالة|الدوال|نهايات|اشتقاق|مشتق|مماس|مقارب|تمثيل بياني|وضع نسبي|أعداد حقيقية|fonction|dérivée|limite|function/i.test(generationRequest);
  const isScientificPaper = forceComprehensive
    || isFunctionStudy
    || /رياضيات|الرياضيات|علوم فيزيائية|فيزياء|الفيزياء|mécanique|physique|mathématiques/i.test(generationRequest);
  const generationInstruction = isFunctionStudy
      ? [
        "طلب الطالب دراسة شاملة ومدققة لدالة عددية. لا تنشئ سؤالًا واحدًا ولا أسئلة اختيار من متعدد ولا تمرينًا قصيرًا.",
        "أنشئ ورقة واحدة متماسكة حول دالة عددية واحدة، لا سؤالًا منفردًا. اجعلها دراسة شاملة طويلة من 8 محاور مترابطة، وكل محور يحتوي سؤالين أو ثلاثة أسئلة فرعية قصيرة عند الحاجة. يجب أن تقود المعطيات نفسها إلى: مجموعة التعريف والنهايات، الاشتقاق، اتجاه التغيرات، جدول التغيرات، حل معادلات أو متراجحات مرتبطة بالدالة، الوضع النسبي وإيجاد الأعداد الحقيقية، التمثيل البياني، المستقيمات المقاربة والمماس، ثم تركيب نهائي.",
        "اجعلها قابلة للنسخ على ورقة مدرسية: سياق مختصر، معطيات واضحة، ثم مطلوبات مرقمة من (أ) إلى (ح). يجب أن تكون كل المطلوبات قابلة للحل من المعطيات نفسها، وأن يكون مجموع العلامات 20 نقطة. لا تستخدم اختيارًا من متعدد ولا صح/خطأ.",
        "أعد أيضًا حلًا نموذجيًا داخليًا خطوة بخطوة وتلميحًا قصيرًا. لا تعرض الحل في prompt أو sections.",
         'أعد sections بهذا الشكل، مع أسئلة فرعية متعددة داخل prompt كل محور: [{"id":"domain","title":"مجموعة التعريف","points":2,"prompt":"أ) ... ب) ..."},{"id":"limits","title":"النهايات والمقارب","points":3,"prompt":"أ) ... ب) ... ج) ..."},{"id":"derivative","title":"الاشتقاق","points":3,"prompt":"أ) ... ب) ..."},{"id":"variations","title":"اتجاه التغيرات وجدولها","points":3,"prompt":"أ) ... ب) ... ج) ..."},{"id":"equations","title":"المعادلات والمتراجحات","points":2,"prompt":"أ) ... ب) ..."},{"id":"relative-position","title":"الوضع النسبي والأعداد الحقيقية","points":2,"prompt":"أ) ... ب) ..."},{"id":"graph","title":"التمثيل البياني والمماس","points":3,"prompt":"أ) ... ب) ... ج) ..."},{"id":"synthesis","title":"تركيب شامل","points":2,"prompt":"أ) ... ب) ..."}]',
      ].join("\n")
    : isScientificPaper
      ? [
          "طلب الطالب ورقة اختبار رسمية. لا تنشئ اختيارًا من متعدد ولا سؤالًا قصيرًا ولا نصًا أدبيًا.",
          "أنشئ موضوعًا على نمط ورقة البكالوريا: معطيات ورموز ووحدات واضحة، ثم مطلوبات رياضية مباشرة مرقمة بفروع (أ) و(ب) و(ج). اجعل كل مطلب قابلًا للحل بالقلم من المعطيات نفسها، واستعمل «عيّن» و«احسب» و«استنتج» و«بيّن» و«ادرس» و«مثّل».",
          "لا تضع عناوين وصفية قبل المطلوبات. title في sections تسمية داخلية فقط؛ أما prompt فيبدأ بالسؤال مباشرة ولا يحتوي على لغة أدبية أو عبارات «اشرح» و«لماذا» و«كيف».",
          "أعد حلًا نموذجيًا داخليًا خطوة بخطوة وتلميحًا لا يكشف النتيجة. لا تضع الحل داخل prompt أو sections.",
          'أعد sections بهذا الشكل، مع عناوين داخلية قصيرة لا تعرض للطالب: [{"id":"data","title":"data","points":3,"prompt":"أ) عيّن المعطيات اللازمة. ب) اكتب العلاقة المناسبة."},{"id":"law","title":"law","points":4,"prompt":"أ) اكتب القانون المستعمل. ب) استنتج..."},{"id":"calculation","title":"calculation","points":5,"prompt":"أ) احسب... ب) استنتج..."},{"id":"interpretation","title":"interpretation","points":4,"prompt":"أ) بيّن... ب) تحقق من التجانس..."},{"id":"synthesis","title":"synthesis","points":4,"prompt":"استنتج النتيجة النهائية."}]',
        ].join("\n")
      : "أنشئ تمرينًا واحدًا قابلًا للحل يعالج الخطأ الأهم في السجل المرفق.";
  const content = await callDeepSeekTextModelWithRetry(
    [
      {
        role: "system",
        content: [
          ADAPTIVE_EXERCISE_PROMPT,
          ACADEMIC_EXAM_PROMPT,
          EXERCISE_GENERATION_PROMPT,
          ...(isScientificPaper ? [INTERACTIVE_EXERCISES_PROMPT] : []),
          GROUNDED_CONTENT_RULES,
          LEARNER_SAFE_OUTPUT_RULES,
          `أنت وكيل تمارين عربي لمنصة توجيه. ${generationInstruction} أخفِ الإجابة في الحقول الداخلية المخصصة لها؛ لا تضع أي جزء من الحل النموذجي في prompt أو sections لأن الطالب سيراهما قبل المحاولة. اجعل الحل خطوة خطوة ومربوطًا بمعرّفات العقد في sourceNodeIds. استخدم الأرقام العادية 1, 2, 3 فقط، ولا تستخدم الأرقام العربية الشرقية.`,
          "هذه الواجهة تحتاج JSON فقط؛ أعد الحقول المطلوبة فقط ولا تضف أي نص خارج الكائن.",
        ].join("\n\n"),
      },
      {
        role: "user",
        content: [
          `عنوان الدرس: ${lesson}`,
          `مستوى الطالب: ${level || "غير محدد"}`,
          `المادة: ${subject || "غير محددة"}`,
          `السنة الدراسية: ${curriculumYear || "غير محددة"}`,
          `المفهوم الحالي: ${activeConcept || "قوانين نيوتن والحركة"}`,
          `سياق الأخطاء السابقة: ${attemptContext || "لا توجد أخطاء محفوظة بعد"}`,
          "عقد المتجه المسترجعة من ChromaDB:",
          sourceText,
          isFunctionStudy
             ? 'أعد الشكل التالي حرفيًا، وأضف sourceNodeIds بمعرّفات العقد المستخدمة: {"lessonTitle":"الدوال العددية","title":"دراسة شاملة في الدوال","prompt":"تعريف مختصر بالورقة دون الحل","answer":"خلاصة النتائج النهائية للاستخدام الداخلي فقط","hint":"تلميح عام لا يكشف الحل","solution":"الحل النموذجي الكامل خطوة خطوة للاستخدام الداخلي فقط","format":"comprehensive_function","totalPoints":20,"sections":[{"id":"limits","title":"النهايات ومجموعة التعريف","points":3,"prompt":"..."},{"id":"derivative","title":"الاشتقاق والتغيرات","points":4,"prompt":"..."},{"id":"relative-position","title":"الوضع النسبي والأعداد الحقيقية","points":4,"prompt":"..."},{"id":"graph","title":"التمثيل البياني","points":4,"prompt":"..."},{"id":"asymptotes","title":"المقارب والمماس","points":3,"prompt":"..."},{"id":"synthesis","title":"تركيب شامل","points":2,"prompt":"..."}],"sourceNodeIds":["node-id"]}'
          : isScientificPaper
               ? 'أعد الشكل التالي حرفيًا، وأضف sourceNodeIds بمعرّفات العقد المستخدمة: {"lessonTitle":"عنوان المادة","title":"موضوع عملي شامل","prompt":"معطيات الورقة دون حل","answer":"خلاصة النتائج النهائية للاستخدام الداخلي فقط","hint":"تلميح عام لا يكشف الحل","solution":"الحل النموذجي الكامل خطوة خطوة للاستخدام الداخلي فقط","format":"comprehensive_science","totalPoints":20,"sections":[{"id":"data","title":"data","points":3,"prompt":"أ) عيّن... ب) اكتب..."},{"id":"law","title":"law","points":4,"prompt":"أ) اكتب... ب) استنتج..."},{"id":"calculation","title":"calculation","points":5,"prompt":"أ) احسب... ب) استنتج..."},{"id":"interpretation","title":"interpretation","points":4,"prompt":"أ) بيّن... ب) تحقق..."},{"id":"synthesis","title":"synthesis","points":4,"prompt":"استنتج النتيجة النهائية."}],"sourceNodeIds":["node-id"]}'
            : 'أعد الشكل التالي حرفيًا، وأضف sourceNodeIds بمعرّفات العقد المستخدمة: {"lessonTitle":"عنوان من المصادر","title":"عنوان التمرين","prompt":"نص تمرين واحد واضح","answer":"الإجابة النهائية المختصرة","hint":"تلميح دون كشف الحل","solution":"الحل خطوة خطوة","sourceNodeIds":["node-id"]}',
        ].join("\n"),
      },
    ],
  { temperature: 0.15, maxOutputTokens: isFunctionStudy ? 4800 : isScientificPaper ? 3400 : 1200, jsonMode: true },
  { maxAttempts: 4, baseDelayMs: 1_000 },
  );
  const candidate = extractJsonObject(content, "Exercise generator");
  const parsed = JSON.parse(candidate) as Partial<GeneratedExercise>;
  if (
    typeof parsed.lessonTitle !== "string" ||
    typeof parsed.title !== "string" ||
    typeof parsed.prompt !== "string" ||
    typeof parsed.answer !== "string" ||
    typeof parsed.hint !== "string" ||
    typeof parsed.solution !== "string" ||
    !Array.isArray(parsed.sourceNodeIds)
  ) {
    throw new Error("Exercise generator returned an incomplete exercise");
  }
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections
        .filter((section): section is NonNullable<GeneratedExercise["sections"]>[number] => Boolean(
          section
          && typeof section.id === "string"
          && typeof section.title === "string"
          && typeof section.points === "number"
          && typeof section.prompt === "string"
          && section.points > 0
          && section.prompt.trim(),
        ))
        .slice(0, 8)
        .map((section) => ({
          id: section.id.trim(),
          title: isFunctionStudy
            ? normalizeFunctionSectionTitle(section.id.trim(), section.title)
            : section.title.trim(),
          points: section.points,
          prompt: section.prompt.trim(),
        }))
    : undefined;
  const format = parsed.format === "comprehensive_function" || parsed.format === "comprehensive_science"
    ? parsed.format
    : undefined;
  if (isScientificPaper && (!format || !sections || sections.length < 5)) {
    throw new Error("Exercise generator returned an incomplete practical paper");
  }
  if (isFunctionStudy && format !== "comprehensive_function") {
    throw new Error("Exercise generator returned a non-function paper for a function study");
  }
  if (isScientificPaper && sections) {
    const totalPoints = typeof parsed.totalPoints === "number"
      ? parsed.totalPoints
      : sections.reduce((sum, section) => sum + section.points, 0);
    if (totalPoints <= 0 || totalPoints > 20 || sections.some((section) => section.prompt.includes("الحل النموذجي"))) {
      throw new Error("Exercise generator returned an invalid practical paper");
    }
  }
  return {
    status: "generated",
    lessonTitle: parsed.lessonTitle,
    title: parsed.title,
    prompt: parsed.prompt,
    answer: parsed.answer,
    hint: parsed.hint,
    solution: parsed.solution,
    sourceDocuments: sourceDocumentsFrom(retrieval.documents),
    sourceNodeIds: assertGroundedNodeIds(parsed.sourceNodeIds, retrieval),
    grounding: retrieval.grounding,
    ...(sections && format
      ? {
          format,
          totalPoints: typeof parsed.totalPoints === "number" ? parsed.totalPoints : sections.reduce((sum, section) => sum + section.points, 0),
          sections,
        }
      : {}),
  };
}

function buildGroundedExerciseFallback(
  lesson: string,
  activeConcept: string,
  retrieval: RetrievalContext,
  forceComprehensive: boolean,
): GeneratedExercise {
  const documents = retrieval.documents
    .filter((document) => typeof document.document === "string" && document.document.trim())
    .slice(0, 3);
  const primary = documents[0];
  const metadata = primary?.metadata ?? {};
  const topic = activeConcept.trim() || String(metadata.lesson || metadata.unit || lesson);
  const sourceLabel = String(metadata.source_file || "المصدر الدراسي");
  const evidence = documents
    .map((document, index) => {
      const sourceMetadata = document.metadata ?? {};
      const source = String(sourceMetadata.source_file || "مصدر دراسي");
      const page = Number(sourceMetadata.source_page || 0);
      return `المقتطف ${index + 1} من «${source}»${page > 0 ? `، ص ${page}` : ""}:\n${(document.document || "").trim().slice(0, 900)}`;
    })
    .join("\n\n");
  const isFunctionStudy =
    /دالة|دوال|الدالة|الدوال|نهايات|اشتقاق|مشتق|مماس|مقارب|تمثيل بياني|fonction|dérivée|limite|function/i.test(
      `${lesson} ${topic} ${evidence}`,
    );
  const isScientificPaper =
    forceComprehensive ||
    isFunctionStudy ||
    /رياضيات|الرياضيات|علوم فيزيائية|فيزياء|الفيزياء|mécanique|physique|mathématiques/i.test(
      `${lesson} ${topic}`,
    );
  const sections = isFunctionStudy
    ? [
        {
          id: "domain",
           title: "D_f · مجموعة التعريف | Domaine",
          points: 2,
          prompt: "أ) اكتب مجموعة تعريف الدالة. ب) اذكر القيم الممنوعة وسبب منعها، ثم أعد كتابة الدالة على شكل يساعدك في متابعة الدراسة.",
        },
        {
          id: "limits",
           title: "lim · النهايات | Limites",
          points: 3,
          prompt: "أ) احسب النهايات عند حدود مجال التعريف. ب) استنتج المقارب العمودي أو الأفقي أو المائل إن أمكن. ج) فسّر النتيجة بيانيًا.",
        },
        {
          id: "derivative",
           title: "f′ · الاشتقاق | Dérivée",
          points: 3,
          prompt: "أ) احسب المشتقة وبسّطها. ب) ادرس إشارتها على كل مجال. ج) اذكر القاعدة التي استعملتها في كل تحويل.",
        },
        {
          id: "variations",
           title: "Δf · اتجاه التغيرات | Variations",
          points: 3,
          prompt: "أ) استنتج اتجاه تغير الدالة. ب) احسب القيم الحدية اللازمة. ج) أنجز جدول التغيرات كاملًا مع احترام القيم الممنوعة.",
        },
        {
          id: "equations",
           title: "E_f · المعادلات والمتراجحات | Équations · Inéquations",
          points: 2,
          prompt: "أ) حل المعادلة المرتبطة بالدالة. ب) استعمل جدول التغيرات أو الإشارة لحل المتراجحة المطلوبة.",
        },
        {
          id: "relative-position",
           title: "C_f/Δ · الوضع النسبي | Position relative",
          points: 2,
          prompt: "أ) ادرس وضع المنحنى بالنسبة إلى المقارب. ب) حدّد نقاط التقاطع أو الأعداد الحقيقية المطلوبة مع تبرير كل نتيجة.",
        },
        {
          id: "graph",
           title: "C_f · التمثيل البياني | Courbe",
          points: 3,
          prompt: "أ) اكتب معادلة المماس في النقطة المطلوبة. ب) أنشئ المنحنى موضحًا المقاربات والمماس. ج) ضع نقاط التقاطع والاتجاهات الأساسية.",
        },
        {
          id: "synthesis",
           title: "Σ · تركيب الدراسة | Synthèse",
          points: 2,
          prompt: "أ) رتّب نتائج الدراسة في خلاصة واحدة. ب) اشرح كيف تتحول كل نتيجة حسابية إلى معلومة على التمثيل البياني.",
        },
      ]
    : [
        {
          id: "data",
          title: "data",
          points: 3,
          prompt: "أ) عيّن المعطيات اللازمة للحل. ب) اكتب الرموز والوحدات المستعملة.",
        },
        {
          id: "principle",
          title: "principle",
          points: 4,
          prompt: "أ) اكتب العلاقة أو القانون المناسب. ب) عوّض بالمعطيات. ج) استنتج النتيجة.",
        },
        {
          id: "application",
          title: "application",
          points: 5,
          prompt: "أ) احسب الكمية المطلوبة. ب) استنتج الكمية التابعة لها. ج) اكتب النتيجة بالوحدة المناسبة.",
        },
        {
          id: "interpretation",
          title: "interpretation",
          points: 4,
          prompt: "أ) بيّن طبيعة النتيجة. ب) تحقق من التجانس البعدي. ج) قارن النتيجة بالمعطيات.",
        },
        {
          id: "synthesis",
          title: "synthesis",
          points: 4,
          prompt: "استنتج النتيجة النهائية للموضوع، مع كتابة العلاقة والنتيجة العددية إن وجدت.",
        },
      ];

  return {
    status: "generated",
    lessonTitle: lesson,
    title: `ورقة تدريب موثقة: ${topic}`,
     prompt: "أنجز الورقة بالقلم، واكتب المعطيات والتحويلات والتبريرات كاملة.",
     answer: "الحل غير معروض في ورقة الطالب. ارفع محاولتك للحصول على توجيه بعد المراجعة.",
     hint: `ابدأ من «${sourceLabel}» وحدد المعطيات اللازمة لكل محور.`,
     solution: "الحل غير معروض في ورقة الطالب. ارفع محاولتك للحصول على توجيه بعد المراجعة.",
    sourceDocuments: sourceDocumentsFrom(documents),
    sourceNodeIds: documents.map((document) => document.id),
    grounding: retrieval.grounding,
    format: isFunctionStudy ? "comprehensive_function" : "comprehensive_science",
    totalPoints: sections.reduce((sum, section) => sum + section.points, 0),
    sections,
    fallback: true,
     fallbackMessage: "هذه ورقة تدريب مبنية على مادة الدرس المتاحة.",
  };
}

async function generateCreativeExerciseTopics(
  lesson: string,
  level: string,
  subject: string,
  curriculumYear: string,
  activeConcept: string,
  attemptContext: string,
  retrieval: RetrievalContext,
): Promise<GeneratedCreativeTopics> {
  const content = await callDeepSeekTextModelWithRetry(
    [
      {
        role: "system",
        content: [
          ADAPTIVE_EXERCISE_PROMPT,
          CREATIVE_EXERCISE_TOPICS_PROMPT,
          GROUNDED_CONTENT_RULES,
          LEARNER_SAFE_OUTPUT_RULES,
          "أنت الآن وكيل التمارين نفسه، لكن بوضع توليد موضوعات إبداعية. أعد الحل المركزي ثم 3 موضوعات مختلفة بالضبط. يجب أن يستشهد كل موضوع بالعقد التي بُني عليها، ويجب أن تكون كل العقد المستخدمة ضمن المصادر المسترجعة.",
          "هذه الواجهة تحتاج JSON فقط؛ لا تضف أي نص خارج الكائن.",
          'أعد الشكل التالي: {"lessonTitle":"عنوان من المصادر","solutionSummary":"الفكرة المركزية والحل الأكاديمي المختصر","ideas":[{"title":"عنوان موضوع إبداعي","approach":"الفكرة وطريقة البدء","steps":["خطوة 1","خطوة 2","خطوة 3"],"creativeTwist":"سؤال أو زاوية مفاجئة","expectedOutcome":"ما الذي سيثبته الطالب","sourceNodeIds":["node-id"]}],"sourceNodeIds":["node-id"]}',
        ].join("\n\n"),
      },
      {
        role: "user",
        content: [
          `عنوان الدرس: ${lesson}`,
          `مستوى الطالب: ${level || "3AS"}`,
          `المادة: ${subject || "غير محددة"}`,
          `السنة الدراسية: ${curriculumYear || "غير محددة"}`,
          `المفهوم الحالي: ${activeConcept || "المفهوم الحالي"}`,
          `سجل الأخطاء أو رغبة الطالب: ${attemptContext || "لا توجد أخطاء محفوظة بعد"}`,
          "غطِّ كل المفاهيم المختلفة الممكنة في عقد المعرفة، ولا تعتمد على مقتطف واحد فقط.",
          "عقد المتجه المسترجعة من ChromaDB:",
          formatRetrievedContext(retrieval.documents),
        ].join("\n"),
      },
    ],
    { temperature: 0.65, maxOutputTokens: 2200, jsonMode: true },
    { maxAttempts: 4, baseDelayMs: 1_000 },
  );
  const candidate = extractJsonObject(content, "Creative exercise agent");
  const parsed = JSON.parse(candidate) as Partial<GeneratedCreativeTopics>;
  if (
    typeof parsed.lessonTitle !== "string" ||
    typeof parsed.solutionSummary !== "string" ||
    !Array.isArray(parsed.ideas) ||
    parsed.ideas.length < 3 ||
    typeof parsed.lessonTitle !== "string" ||
    parsed.lessonTitle.trim().length < 2 ||
    parsed.ideas.some((idea) => !idea || typeof idea !== "object") ||
    !Array.isArray(parsed.sourceNodeIds)
  ) {
    throw new Error("Creative exercise agent returned an incomplete response");
  }

  const ideas = parsed.ideas.slice(0, 5).map((idea, index) => {
    if (
      !idea ||
      typeof idea.title !== "string" ||
      typeof idea.approach !== "string" ||
      !Array.isArray(idea.steps) ||
      idea.steps.length < 3 ||
      typeof idea.creativeTwist !== "string" ||
      typeof idea.expectedOutcome !== "string"
    ) {
      throw new Error(
        `Creative exercise agent returned an invalid topic at index ${index}`,
      );
    }
    const steps = idea.steps
      .filter(
        (step): step is string =>
          typeof step === "string" && Boolean(step.trim()),
      )
      .slice(0, 5);
    if (steps.length < 3) {
      throw new Error(
        `Creative exercise agent returned too few steps at index ${index}`,
      );
    }
    return {
      title: idea.title.trim(),
      approach: idea.approach.trim(),
      steps,
      creativeTwist: idea.creativeTwist.trim(),
      expectedOutcome: idea.expectedOutcome.trim(),
      sourceNodeIds: assertGroundedNodeIds(idea.sourceNodeIds, retrieval),
    };
  });

  return {
    status: "generated",
    mode: "creative_topic",
    agent: "exercises",
    lessonTitle: parsed.lessonTitle.trim(),
    solutionSummary: parsed.solutionSummary.trim(),
    ideas,
    sourceDocuments: sourceDocumentsFrom(retrieval.documents),
    sourceNodeIds: assertGroundedNodeIds(parsed.sourceNodeIds, retrieval),
    grounding: retrieval.grounding,
  };
}

function groundedCreativeTopicFallback(
  lesson: string,
  retrieval: RetrievalContext,
): GeneratedCreativeTopics {
  const documents = retrieval.documents.slice(0, 3);
  const ideas = [
    {
      title: "استخرج الفكرة من المرجع",
      approach: "اقرأ المقتطف المصدر وحدد المفهوم أو القاعدة التي يعالجها قبل كتابة أي حل.",
      steps: [
        "حدد المعطيات والكلمات المفتاحية في المرجع.",
        "اكتب القاعدة أو الفكرة كما تظهر في المصدر.",
        "طبّقها على مثال قصير من نفس المرجع وتحقق من النتيجة.",
      ],
      creativeTwist: "غيّر ترتيب المعطيات واسأل: ما الذي يبقى صحيحًا؟",
      expectedOutcome: "تمييز الفكرة المركزية وربطها بالمعطيات المصدرية.",
    },
    {
      title: "حوّل المرجع إلى وضعية",
      approach: "أعد صياغة المثال أو التمرين المصدر في وضعية تطبيقية مع الحفاظ على معطياته.",
      steps: [
        "استخرج المعطيات القابلة للقياس من المرجع.",
        "اكتب المطلوب بصيغة سؤال واحد واضح.",
        "حل الوضعية خطوة خطوة وقارنها بالحل أو الفكرة في المصدر.",
      ],
      creativeTwist: "أضف قيدًا واحدًا ثم حدّد الخطوة التي ستتغير.",
      expectedOutcome: "تحويل المعرفة النظرية إلى إجراء قابل للتحقق.",
    },
    {
      title: "اختبر حدود القاعدة",
      approach: "ابحث في المرجع عن الحالة التي تتغير فيها الطريقة أو تحتاج إلى تبرير إضافي.",
      steps: [
        "اكتب الحالة الأصلية والشرط الذي تعتمد عليه.",
        "اقترح تغييرًا واحدًا في المعطيات.",
        "برهن من المصدر هل تبقى الطريقة صالحة أم تحتاج إلى تعديل.",
      ],
      creativeTwist: "اطلب تبرير كل خطوة بدل الاكتفاء بالنتيجة النهائية.",
      expectedOutcome: "التدرب على التحقق وعدم تطبيق القاعدة خارج شروطها.",
    },
  ].map((idea, index) => ({
    ...idea,
    sourceNodeIds: [documents[index % documents.length].id],
  }));

  return {
    status: "generated",
    mode: "creative_topic",
    agent: "exercises",
    lessonTitle: lesson.trim(),
    solutionSummary:
      "أعددنا لك مسارات أولية مبنية مباشرة على مادة الدرس المتاحة.",
    ideas,
    sourceDocuments: sourceDocumentsFrom(documents),
    sourceNodeIds: assertGroundedNodeIds(
      documents.map((document) => document.id),
      retrieval,
    ),
    grounding: retrieval.grounding,
    fallback: true,
    fallbackMessage:
      "هذه مسارات أولية مبنية على مادة الدرس المتاحة.",
  };
}

router.post("/lesson/generate", async (req, res): Promise<void> => {
  const { lesson, level, activeConcept, attemptContext } = req.body as Record<
    string,
    unknown
  >;
  const { subject, curriculum_year: curriculumYear } = req.body as Record<
    string,
    unknown
  >;
  if (
    typeof lesson !== "string" ||
    lesson.trim().length < 2 ||
    (level !== undefined && typeof level !== "string") ||
    (subject !== undefined && typeof subject !== "string") ||
    (curriculumYear !== undefined && typeof curriculumYear !== "string") ||
    (activeConcept !== undefined && typeof activeConcept !== "string") ||
    (attemptContext !== undefined && typeof attemptContext !== "string")
  ) {
    res.status(400).json({ error: "invalid_lesson_generation_payload" });
    return;
  }
  let retrieval: RetrievalContext | undefined;
  try {
    retrieval = await retrieveGroundedKnowledge(
      [lesson, activeConcept, attemptContext]
        .filter((value): value is string => Boolean(value))
        .join(" "),
      {
        where:
          typeof subject === "string" || typeof curriculumYear === "string"
            ? {
                ...(typeof subject === "string" && subject
                  ? { subject }
                  : {}),
                ...(typeof curriculumYear === "string" && curriculumYear
                  ? { curriculum_year: curriculumYear }
                  : {}),
              }
            : undefined,
      },
    );
    const generated = await generateLesson(
      lesson,
      typeof level === "string" ? level : "",
      typeof subject === "string" ? subject : "",
      typeof curriculumYear === "string" ? curriculumYear : "",
      typeof activeConcept === "string" ? activeConcept : "",
      typeof attemptContext === "string" ? attemptContext : "",
      retrieval,
    );
    res.json(generated);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    req.log.error({ error: errorMessage }, "Lesson generation failed");
    const message = errorMessage.includes("XAI_CONNECTION_NOT_CONFIGURED")
      ? "تعذر تشغيل المساعدة الذكية لأن اتصال مزود الذكاء الاصطناعي غير مهيأ. يمكنك متابعة الدرس من المصادر المتاحة، ثم إعادة المحاولة بعد تهيئة الاتصال."
      : errorMessage.includes("GEMINI_CONNECTION_NOT_CONFIGURED") ||
          errorMessage.includes("DEEPSEEK_CONNECTION_NOT_CONFIGURED")
        ? "رفضت خدمة Gemini المفتاح الحالي أو لم تقبله. تحقق من GEMINI_API_KEY في Secrets ثم أعد المحاولة، ويمكنك متابعة الدرس من المصادر المتاحة الآن."
        : errorMessage.includes("Gemini provider responded with 5") ||
            errorMessage.includes("Gemini provider responded with 429")
          ? "خدمة Gemini مشغولة مؤقتًا. أعد المحاولة بعد قليل، ويمكنك متابعة الدرس من المصادر المتاحة الآن."
        : errorMessage.includes("DeepSeek provider responded with 402")
          ? "تعذر إكمال المساعدة الذكية لأن خدمة النموذج رفضت الطلب. يمكنك متابعة الدرس من المصادر المتاحة والمحاولة لاحقًا."
          : errorMessage.startsWith("Lesson generator responded with")
            ? "لم يكتمل تجهيز الشرح الآن. أعد المحاولة بعد قليل."
            : "لم نتمكن من تجهيز الشرح الآن. يمكنك متابعة المصادر والمحاولة لاحقًا.";
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error:
        error instanceof KnowledgeGroundingError
          ? error.code
          : "lesson_generation_failed",
      message,
    });
  }
});

router.post("/lesson/exercise", async (req, res): Promise<void> => {
  const {
    lesson,
    level,
    subject,
    curriculum_year: curriculumYear,
    activeConcept,
    attemptContext,
    mode,
    worksheet,
  } =
    req.body as Record<string, unknown>;
  if (
    typeof lesson !== "string" ||
    lesson.trim().length < 2 ||
    (level !== undefined && typeof level !== "string") ||
    (subject !== undefined && typeof subject !== "string") ||
    (curriculumYear !== undefined && typeof curriculumYear !== "string") ||
    (activeConcept !== undefined && typeof activeConcept !== "string") ||
    (attemptContext !== undefined && typeof attemptContext !== "string") ||
    (mode !== undefined && mode !== "standard" && mode !== "paper" && mode !== "creative_topic")
    || (worksheet !== undefined && worksheet !== "comprehensive")
  ) {
    res.status(400).json({ error: "invalid_exercise_generation_payload" });
    return;
  }
  let retrieval: RetrievalContext | undefined;
  const requestText = [lesson, activeConcept, attemptContext]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const isPaperRequest =
    mode === "paper" ||
    worksheet === "comprehensive" ||
    /رياضيات|الرياضيات|علوم فيزيائية|فيزياء|الفيزياء|دوال|الدالة|الدوال|نهايات|اشتقاق|مشتق|مماس|مقارب|تمثيل بياني|fonction|dérivée|limite|mécanique|physique|mathématiques/i.test(
      requestText,
    );
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    let historicalErrors = "";
    try {
      const errorBank = await listErrorBank(userId);
      historicalErrors = errorBank.errors
        .slice(0, 12)
        .map((error) => `${error.concept_title}: ${error.error_tag}`)
        .join(" | ");
    } catch (error) {
      // Error history improves personalization, but it must not block a
      // grounded exercise when the optional progress store is unavailable.
      req.log.warn(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        "Skipping error-bank context during exercise generation",
      );
    }
    retrieval = await retrieveGroundedKnowledge(
      [
        lesson,
        activeConcept,
        historicalErrors,
        mode === "creative_topic"
          ? "موضوعات تطبيقية إبداعية، وضعيات، تجارب ذهنية، تمثيل بصري، وتحديات تغطي كل مكتسبات المنهاج"
          : "تمارين",
      ]
        .filter((value): value is string => Boolean(value))
        .join(" "),
      {
        nResults: mode === "creative_topic" ? 24 : isPaperRequest ? 20 : 8,
        where:
          typeof subject === "string" || typeof curriculumYear === "string"
            ? {
                ...(typeof subject === "string" && subject
                  ? { subject }
                  : {}),
                ...(typeof curriculumYear === "string" && curriculumYear
                  ? { curriculum_year: curriculumYear }
                  : {}),
              }
            : undefined,
      },
    );
    if (mode === "creative_topic") {
      const generatedTopics = await generateCreativeExerciseTopics(
        lesson,
        typeof level === "string" ? level : "",
        typeof subject === "string" ? subject : "",
        typeof curriculumYear === "string" ? curriculumYear : "",
        typeof activeConcept === "string" ? activeConcept : "",
        [
          typeof attemptContext === "string" ? attemptContext : "",
          historicalErrors,
        ]
          .filter(Boolean)
          .join(" | "),
        retrieval,
      );
      res.json(generatedTopics);
      return;
    }
    const generated = await generateExercise(
      lesson,
      typeof level === "string" ? level : "",
      typeof subject === "string" ? subject : "",
      typeof curriculumYear === "string" ? curriculumYear : "",
      typeof activeConcept === "string" ? activeConcept : "",
      [
        typeof attemptContext === "string" ? attemptContext : "",
        historicalErrors,
      ]
        .filter(Boolean)
        .join(" | "),
      isPaperRequest,
      retrieval,
    );
    if (mode === "paper") {
      const studentPaper: StudentPaper = {
        status: generated.status,
        mode: "paper",
        lessonTitle: generated.lessonTitle,
        title: generated.title,
        prompt: generated.prompt,
        format: generated.format ?? "comprehensive_science",
        totalPoints: generated.totalPoints ?? generated.sections?.reduce((sum, section) => sum + section.points, 0) ?? 0,
        sections: generated.sections ?? [],
      };
      res.json(studentPaper);
      return;
    }
     res.json(studentExerciseView(generated));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    req.log.error({ error: errorMessage }, "Exercise generation failed");
    if (
      mode === "creative_topic" &&
      error instanceof DeepSeekProviderError &&
      error.retryable &&
      retrieval
    ) {
      req.log.warn(
        { status: error.status },
        "Returning grounded creative-topic fallback after temporary provider failure",
      );
      res.json(
        groundedCreativeTopicFallback(
          lesson,
          retrieval,
        ),
      );
      return;
    }
    if (
      error instanceof DeepSeekProviderError &&
      error.retryable &&
      retrieval
    ) {
      req.log.warn(
        { status: error.status },
        "Returning grounded exercise fallback after temporary provider failure",
      );
      const fallback = buildGroundedExerciseFallback(
        lesson,
        typeof activeConcept === "string" ? activeConcept : "",
        retrieval,
        isPaperRequest,
      );
      if (mode === "paper") {
        const studentPaper: StudentPaper = {
          status: fallback.status,
          mode: "paper",
          lessonTitle: fallback.lessonTitle,
          title: fallback.title,
          prompt: fallback.prompt,
          format: fallback.format ?? "comprehensive_science",
          totalPoints: fallback.totalPoints ?? 20,
          sections: fallback.sections ?? [],
        };
        res.json(studentPaper);
      } else {
        res.json(studentExerciseView(fallback));
      }
      return;
    }
    const message = errorMessage.includes("XAI_CONNECTION_NOT_CONFIGURED")
      ? "تعذر تشغيل المساعدة الذكية لأن اتصال مزود الذكاء الاصطناعي غير مهيأ. يمكنك متابعة الدرس من المصادر المتاحة، ثم إعادة المحاولة بعد تهيئة الاتصال."
      : errorMessage.includes("GEMINI_CONNECTION_NOT_CONFIGURED") ||
          errorMessage.includes("DEEPSEEK_CONNECTION_NOT_CONFIGURED")
        ? "رفضت خدمة Gemini المفتاح الحالي أو لم تقبله. تحقق من GEMINI_API_KEY في Secrets ثم أعد المحاولة، ويمكنك متابعة الدرس من المصادر المتاحة الآن."
          : errorMessage.includes("Gemini provider responded with 5") ||
              errorMessage.includes("Gemini provider responded with 429")
          ? "خدمة Gemini مشغولة مؤقتًا. أعد المحاولة بعد قليل، ويمكنك متابعة الدرس من المصادر المتاحة الآن."
        : errorMessage.startsWith("xAI provider responded with")
          ? "لم يكتمل تجهيز التمرين الآن. أعد المحاولة بعد قليل."
          : mode === "creative_topic"
            ? "لم تكتمل المساعدة الآن. يمكنك متابعة الدرس والمحاولة لاحقًا."
            : "لم نتمكن من تجهيز التمرين الآن. أعد المحاولة بعد قليل.";
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error:
        error instanceof KnowledgeGroundingError
          ? error.code
          : "exercise_generation_failed",
      message,
    });
  }
});

export default router;
