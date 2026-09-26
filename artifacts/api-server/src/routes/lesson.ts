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
  FUNCTION_ACADEMIC_EXAM_PROMPT,
  FUNCTION_EXERCISE_PROMPT,
  FRIENDLY_TUTOR_PROMPT,
  GROUNDED_CONTENT_RULES,
  INTERACTIVE_EXERCISES_PROMPT,
  LEARNER_SAFE_OUTPUT_RULES,
  LESSON_GENERATION_PROMPT,
  SCIENCE_EXERCISE_PROMPT,
  FUNCTION_SINGLE_EXERCISE_PROMPT,
  SOURCE_TOPIC_EXERCISE_PROMPT,
} from "../lib/ai-prompts";
import {
  callDeepSeekTextModelWithRetry,
  DeepSeekProviderError,
  shouldUseGroundedProviderFallback,
} from "../lib/ai-provider";
import { normalizeFunctionSectionTitle } from "../lib/function-section-titles";
import {
  assertGroundedReviewPaperContract,
  assertReviewPaperDifficulty,
  FUNCTION_REVIEW_SECTION_IDS,
  REVIEW_PAPER_DIFFICULTY,
} from "../lib/review-paper-contract";
import {
  assertGroundedScienceReviewPaperContract,
  selectGroundedScientificScenario,
} from "../lib/scientific-paper-contract";
import { assertGroundedSourceTopicPaperContract } from "../lib/source-topic-contract";
import {
  classifyExerciseIntent,
  FUNCTION_REQUEST_PATTERN,
  type ExerciseIntent,
} from "../lib/exercise-intent";

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
  difficulty?: typeof REVIEW_PAPER_DIFFICULTY;
  format?: "comprehensive_function" | "comprehensive_science" | "source_topic";
  totalPoints?: number;
  sections?: Array<{
    id: string;
    title: string;
    points: number;
    prompt: string;
    sourceNodeIds?: string[];
    evidence?: string;
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
  difficulty: typeof REVIEW_PAPER_DIFFICULTY;
  format: "comprehensive_function" | "comprehensive_science" | "source_topic";
  totalPoints: number;
  sections: Array<{
    id: string;
    title: string;
    points: number;
    prompt: string;
  }>;
  fallback?: boolean;
  fallbackMessage?: string;
};

type StudentExercise = {
  status: "generated";
  lessonTitle: string;
  title: string;
  prompt: string;
  format?: "comprehensive_function" | "comprehensive_science" | "source_topic";
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
  studentRequest: string,
  exerciseIntent: ExerciseIntent,
  forceComprehensive: boolean,
  retrieval: RetrievalContext,
): Promise<GeneratedExercise> {
  const sourceText = formatRetrievedContext(retrieval.documents);
  const studyRequest = [
    lesson,
    subject,
    activeConcept,
  ].join(" ");
  const isPhysicsRequest =
    /فيزياء|فيزيائي|physics|physique/i.test(studyRequest);
  const isSingleFunctionExercise =
    !forceComprehensive && exerciseIntent === "single_function";
  const isFunctionStudy =
    forceComprehensive &&
    !isPhysicsRequest &&
    exerciseIntent !== "multi_topic" &&
    FUNCTION_REQUEST_PATTERN.test(studentRequest);
  const isPhysicsPaper = forceComprehensive && isPhysicsRequest;
  const isSourceTopicPaper =
    forceComprehensive && !isPhysicsPaper && !isFunctionStudy;
  const generationInstruction = isSingleFunctionExercise
      ? [
        "طلب الطالب تمرين دوال واحد فقط، وليس موضوعًا شاملًا.",
        "أنشئ مسألة واحدة حول دالة محددة من المصادر، مع فرعين أو ثلاثة فروع قصيرة مترابطة عند الحاجة.",
        "أعد prompt واضحًا قابلًا للحل، والحل والتلميح في الحقول الداخلية فقط.",
      ].join("\n")
    : isFunctionStudy
      ? [
        "مستوى الصعوبة إلزاميًا: متقدم. يجب أن يعلن JSON الحقل difficulty بالقيمة الإنجليزية الحرفية advanced، وإلا تُرفض الورقة. اجعلها على نمط بكالوريا صارم، وكل محور متعدد الخطوات، واجعل الانتقال بين المحاور يعتمد على نتيجة المحور السابق.",
        "طلب الطالب دراسة شاملة ومدققة لدالة عددية. لا تنشئ سؤالًا واحدًا ولا أسئلة اختيار من متعدد ولا تمرينًا قصيرًا.",
        "أنشئ ورقة واحدة متماسكة حول دالة عددية واحدة، لا سؤالًا منفردًا. اجعلها دراسة شاملة من 10 محاور مترابطة، وكل محور يحتوي سؤالين أو ثلاثة أسئلة فرعية قصيرة عند الحاجة. يجب أن تقود المعطيات نفسها إلى: مجموعة التعريف والنهايات، الاشتقاق، اتجاه التغيرات، جدول التغيرات، حل معادلات أو متراجحات مرتبطة بالدالة، الوضع النسبي، المناقشة الأفقية، المناقشة المائلة، التمثيل البياني، ثم تركيب نهائي.",
        "اجعلها قابلة للنسخ على ورقة مدرسية: سياق مختصر، معطيات واضحة، ثم مطلوبات مرقمة من (أ) إلى (ح). يجب أن تكون كل المطلوبات قابلة للحل من المعطيات نفسها، وأن يكون مجموع العلامات 20 نقطة. لا تستخدم اختيارًا من متعدد ولا صح/خطأ.",
        "أعد أيضًا حلًا نموذجيًا داخليًا خطوة بخطوة وتلميحًا قصيرًا. لا تعرض الحل في prompt أو sections.",
        "أضف محورين مستقلين وصريحين لا يجوز حذفهما: «المناقشة الأفقية» لدراسة عدد حلول f(x)=m وتمثيلها بالنسبة إلى y=m، و«المناقشة المائلة» لدراسة الوضع النسبي أو عدد حلول f(x)=ax+b عندما تثبت المصادر ذلك. لا تخترع معطيات أو قوانين لهذين المحورين؛ إذا لم تثبتها المصادر ارفض التوليد بدل التخمين.",
        'أعد sections بهذا الترتيب وبمجموع 20 نقطة. كل section يجب أن يحتوي sourceNodeIds مأخوذة من العقد المسترجعة نفسها، وevidence عبارة قصيرة منسوخة حرفيًا من نص إحدى تلك العقد لتثبت أن المطلوب ليس قالبًا ثابتًا: [{"id":"domain","title":"مجموعة التعريف","points":2,"prompt":"أ) ... ب) ...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"limits","title":"النهايات والمقارب","points":2,"prompt":"أ) ... ب) ...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"derivative","title":"الاشتقاق","points":2,"prompt":"أ) ... ب) ...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"variations","title":"اتجاه التغيرات وجدولها","points":2,"prompt":"أ) ... ب) ...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"equations","title":"المعادلات والمتراجحات","points":2,"prompt":"أ) ... ب) ...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"relative-position","title":"الوضع النسبي","points":2,"prompt":"أ) ... ب) ...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"horizontal-discussion","title":"المناقشة الأفقية","points":2,"prompt":"أ) ... ب) ...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"oblique-discussion","title":"المناقشة المائلة","points":2,"prompt":"أ) ... ب) ...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"graph","title":"التمثيل البياني والمماس","points":2,"prompt":"أ) ... ب) ...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"synthesis","title":"تركيب شامل","points":2,"prompt":"أ) ... ب) ...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"}]',
      ].join("\n")
     : isPhysicsPaper
      ? [
          "مستوى الصعوبة إلزاميًا: متقدم. يجب أن يعلن JSON الحقل difficulty بالقيمة الإنجليزية الحرفية advanced، وإلا تُرفض الورقة.",
          "طلب الطالب ورقة اختبار رسمية. لا تنشئ اختيارًا من متعدد ولا سؤالًا قصيرًا ولا نصًا أدبيًا.",
          "أنشئ مسألة فيزيائية محددة حول المفهوم المطلوب، لا ورقة تعليمات عامة. ابدأ prompt بوضعية واقعية قصيرة تشرح ما يحدث، ثم اذكر المعطيات العددية ورموزها ووحداتها صراحة. يجب أن تتضمن الوضعية قيمتين فيزيائيتين على الأقل بوحداتهما، وأن تكونا من العقد المسترجعة ويمكن التحقق منهما فيها.",
          "اجعل الأقسام الخمسة تطبيقًا على الوضعية نفسها وبالترتيب: تعيين المعطيات ووحداتها؛ اختيار القانون وكتابته؛ التعويض والحساب ثم استنتاج الكمية التابعة؛ تفسير النتيجة والتحقق من تجانس الوحدات؛ خلاصة عددية نهائية. لا تكتب هذه الخطوات بدل المسألة، ولا تترك بيانات أو فراغات ليخترعها الطالب.",
          "لا تضع عناوين وصفية قبل المطلوبات. title في sections تسمية داخلية فقط؛ أما prompt فيبدأ بالسؤال مباشرة ولا يحتوي على لغة أدبية أو عبارات «اشرح» و«لماذا» و«كيف».",
          "أعد حلًا نموذجيًا داخليًا خطوة بخطوة وتلميحًا لا يكشف النتيجة. لا تضع الحل داخل prompt أو sections.",
          'أعد خمسة أقسام فقط بهذه المعرفات والترتيب والنقاط: data (3)، law (4)، calculation (5)، interpretation (4)، synthesis (4). اكتبها بأسلوب الورقة المرفقة، وأضف لكل قسم sourceNodeIds بمعرّفات موجودة فعلًا وevidence مقتبسًا حرفيًا من العقدة: [{"id":"data","title":"المعطيات","points":3,"prompt":"أ) عيّن المعطيات اللازمة للحل. ب) اكتب الرموز والوحدات المستعملة.","sourceNodeIds":["node-id"],"evidence":"اقتباس حرفي"},{"id":"law","title":"القانون","points":4,"prompt":"أ) اكتب العلاقة أو القانون المناسب. ب) عوّض بالمعطيات. ج) استنتج النتيجة.","sourceNodeIds":["node-id"],"evidence":"اقتباس حرفي"},{"id":"calculation","title":"الحساب","points":5,"prompt":"أ) احسب الكمية المطلوبة. ب) استنتج الكمية التابعة لها. ج) اكتب النتيجة بالوحدة المناسبة.","sourceNodeIds":["node-id"],"evidence":"اقتباس حرفي"},{"id":"interpretation","title":"التحقق","points":4,"prompt":"أ) بيّن طبيعة النتيجة. ب) تحقق من التجانس البعدي. ج) قارن النتيجة بالمعطيات.","sourceNodeIds":["node-id"],"evidence":"اقتباس حرفي"},{"id":"synthesis","title":"التركيب","points":4,"prompt":"استنتج النتيجة النهائية للموضوع مع كتابة العلاقة والنتيجة العددية ووحدتها.","sourceNodeIds":["node-id"],"evidence":"اقتباس حرفي"}]',
        ].join("\n")
      : isSourceTopicPaper
        ? [
          "طلب الطالب موضوعًا متعدد التمارين.",
          "حافظ على بنية الموضوع وترتيب المطلوبات وعناوين الأقسام كما تظهر في المصادر المسترجعة.",
          "لا تستخدم قالب الأقسام الخمسة العام؛ كل section يجب أن يمثل تمرينًا أو فرعًا موجودًا في المصدر.",
        ].join("\n")
        : "أنشئ تمرينًا واحدًا قابلًا للحل يعالج الخطأ الأهم في السجل المرفق.";
  const generationMessages = [
      {
        role: "system" as const,
        content: [
          ADAPTIVE_EXERCISE_PROMPT,
           ...(isSingleFunctionExercise
             ? [FUNCTION_SINGLE_EXERCISE_PROMPT]
             : []),
           ...(isFunctionStudy
            ? [ACADEMIC_EXAM_PROMPT, FUNCTION_ACADEMIC_EXAM_PROMPT]
            : []),
          EXERCISE_GENERATION_PROMPT,
          ...(isFunctionStudy ? [FUNCTION_EXERCISE_PROMPT] : []),
           ...(isSourceTopicPaper ? [SOURCE_TOPIC_EXERCISE_PROMPT, INTERACTIVE_EXERCISES_PROMPT] : []),
           ...(isPhysicsPaper ? [INTERACTIVE_EXERCISES_PROMPT, SCIENCE_EXERCISE_PROMPT] : []),
          GROUNDED_CONTENT_RULES,
          LEARNER_SAFE_OUTPUT_RULES,
           `أنت وكيل تمارين عربي لمنصة توجيه. ${generationInstruction} أخفِ الإجابة في الحقول الداخلية المخصصة لها؛ لا تضع أي جزء من الحل النموذجي في prompt أو sections لأن الطالب سيراهما قبل المحاولة. اجعل الحل خطوة خطوة ومربوطًا بمعرّفات العقد في sourceNodeIds. استخدم الأرقام العادية 1, 2, 3 فقط، ولا تستخدم الأرقام العربية الشرقية.`,
          "هذه الواجهة تحتاج JSON فقط؛ أعد الحقول المطلوبة فقط ولا تضف أي نص خارج الكائن.",
        ].join("\n\n"),
      },
      {
        role: "user" as const,
        content: [
          `عنوان الدرس: ${lesson}`,
          `مستوى الطالب: ${level || "غير محدد"}`,
          `المادة: ${subject || "غير محددة"}`,
          `السنة الدراسية: ${curriculumYear || "غير محددة"}`,
          `المفهوم الحالي: ${activeConcept || "المفهوم المحدد في عنوان الدرس والمصادر"}`,
           `صياغة طلب الطالب الأصلية: ${studentRequest || "طلب تمرين من الواجهة"}`,
          `سياق الأخطاء السابقة: ${attemptContext || "لا توجد أخطاء محفوظة بعد"}`,
          "عقد المتجه المسترجعة من ChromaDB:",
          sourceText,
           isFunctionStudy
             ? 'أعد الشكل التالي حرفيًا، وأضف difficulty:"advanced" وsourceNodeIds على مستوى الورقة وكل section، وevidence مقتبسًا حرفيًا من العقدة المستخدمة: {"lessonTitle":"الدوال العددية","title":"دراسة شاملة في الدوال","prompt":"تعريف مختصر بالورقة دون الحل","answer":"خلاصة النتائج النهائية للاستخدام الداخلي فقط","hint":"تلميح عام لا يكشف الحل","solution":"الحل النموذجي الكامل خطوة خطوة للاستخدام الداخلي فقط","difficulty":"advanced","format":"comprehensive_function","totalPoints":20,"sections":[{"id":"domain","title":"مجموعة التعريف","points":2,"prompt":"...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"limits","title":"النهايات","points":2,"prompt":"...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"derivative","title":"الاشتقاق","points":2,"prompt":"...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"variations","title":"التغيرات","points":2,"prompt":"...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"equations","title":"المعادلات","points":2,"prompt":"...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"relative-position","title":"الوضع النسبي","points":2,"prompt":"...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"horizontal-discussion","title":"المناقشة الأفقية","points":2,"prompt":"...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"oblique-discussion","title":"المناقشة المائلة","points":2,"prompt":"...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"graph","title":"التمثيل البياني","points":2,"prompt":"...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"},{"id":"synthesis","title":"تركيب شامل","points":2,"prompt":"...","sourceNodeIds":["node-id"],"evidence":"عبارة من المصدر"}],"sourceNodeIds":["node-id"]}'
             : isPhysicsPaper
               ? 'أعد الشكل التالي حرفيًا، مع وضع مسألة ذات وضعية ومعطيات عددية ووحدات موثقة في prompt، وأضف difficulty:"advanced" وsourceNodeIds على مستوى الورقة ولكل قسم مع evidence مقتبس حرفيًا: {"lessonTitle":"عنوان المادة","title":"مسألة فيزيائية تطبيقية","prompt":"وضعية واقعية واضحة تتضمن معطيين عدديين على الأقل بوحداتهما من المصادر، دون الحل","answer":"خلاصة النتائج النهائية للاستخدام الداخلي فقط","hint":"تلميح عام لا يكشف الحل","solution":"الحل النموذجي الكامل خطوة خطوة للاستخدام الداخلي فقط","difficulty":"advanced","format":"comprehensive_science","totalPoints":20,"sections":[{"id":"data","title":"المعطيات","points":3,"prompt":"أ) عيّن المعطيات اللازمة للحل. ب) اكتب الرموز والوحدات المستعملة.","sourceNodeIds":["node-id"],"evidence":"اقتباس حرفي من المصدر"},{"id":"law","title":"القانون","points":4,"prompt":"أ) اكتب العلاقة أو القانون المناسب. ب) عوّض بالمعطيات. ج) استنتج النتيجة.","sourceNodeIds":["node-id"],"evidence":"اقتباس حرفي من المصدر"},{"id":"calculation","title":"الحساب","points":5,"prompt":"أ) احسب الكمية المطلوبة. ب) استنتج الكمية التابعة لها. ج) اكتب النتيجة بالوحدة المناسبة.","sourceNodeIds":["node-id"],"evidence":"اقتباس حرفي من المصدر"},{"id":"interpretation","title":"التحقق","points":4,"prompt":"أ) بيّن طبيعة النتيجة. ب) تحقق من التجانس البعدي. ج) قارن النتيجة بالمعطيات.","sourceNodeIds":["node-id"],"evidence":"اقتباس حرفي من المصدر"},{"id":"synthesis","title":"التركيب","points":4,"prompt":"استنتج النتيجة النهائية للموضوع مع كتابة العلاقة والنتيجة العددية ووحدتها.","sourceNodeIds":["node-id"],"evidence":"اقتباس حرفي من المصدر"}],"sourceNodeIds":["node-id"]}'
             : isSourceTopicPaper
               ? 'أعد الشكل التالي حرفيًا، مع الحفاظ على ترتيب الموضوع وأقسامه كما تظهر في المصادر، وأضف difficulty:"advanced" وformat:"source_topic" وsourceNodeIds على مستوى الورقة وكل section مع evidence مقتبس حرفيًا: {"lessonTitle":"عنوان من المصدر","title":"موضوع متعدد التمارين","prompt":"وضعية الموضوع ومعطياته من المصدر دون الحل","answer":"الخلاصة النهائية للاستخدام الداخلي فقط","hint":"تلميح عام لا يكشف الحل","solution":"الحل النموذجي الكامل للاستخدام الداخلي فقط","difficulty":"advanced","format":"source_topic","totalPoints":20,"sections":[{"id":"source-section-1","title":"عنوان القسم كما في المصدر","points":10,"prompt":"المطلوب كما يظهر في المصدر","sourceNodeIds":["node-id"],"evidence":"عبارة مقتبسة حرفيًا من المصدر"},{"id":"source-section-2","title":"عنوان القسم التالي كما في المصدر","points":10,"prompt":"المطلوب التالي كما يظهر في المصدر","sourceNodeIds":["node-id"],"evidence":"عبارة مقتبسة حرفيًا من المصدر"}],"sourceNodeIds":["node-id"]}'
            : 'أعد الشكل التالي حرفيًا، وأضف sourceNodeIds بمعرّفات العقد المستخدمة: {"lessonTitle":"عنوان من المصادر","title":"عنوان التمرين","prompt":"نص تمرين واحد واضح","answer":"الإجابة النهائية المختصرة","hint":"تلميح دون كشف الحل","solution":"الحل خطوة خطوة","sourceNodeIds":["node-id"]}',
        ].join("\n"),
      },
  ];
  let lastValidationError: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const content = await callDeepSeekTextModelWithRetry(
      [
        ...generationMessages,
        ...(lastValidationError
          ? [
              {
                role: "user" as const,
                content: `أعد المحاولة كاملة. فشل الإخراج السابق في التحقق لهذا السبب: ${lastValidationError}. أصلح السبب وأعد كائن JSON كاملًا، لا تكتفِ بشرح التعديل.`,
              },
            ]
          : []),
      ],
      {
        temperature: 0.15,
         maxOutputTokens: isFunctionStudy ? 4800 : forceComprehensive ? 4200 : 1400,
        jsonMode: true,
      },
      { maxAttempts: 4, baseDelayMs: 1_000 },
    );

    try {
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
              && Array.isArray(section.sourceNodeIds)
              && typeof section.evidence === "string"
              && section.evidence.trim()
              && section.points > 0
              && section.prompt.trim(),
            ))
            .slice(0, isFunctionStudy ? FUNCTION_REVIEW_SECTION_IDS.length : 8)
            .map((section) => ({
              id: section.id.trim(),
              title: isFunctionStudy
                ? normalizeFunctionSectionTitle(section.id.trim(), section.title)
                : section.title.trim(),
              points: section.points,
              prompt: section.prompt.trim(),
              sourceNodeIds: assertGroundedNodeIds(section.sourceNodeIds, retrieval),
              evidence: section.evidence?.trim() ?? "",
            }))
        : undefined;
      const format =
        parsed.format === "comprehensive_function" ||
        parsed.format === "comprehensive_science" ||
        parsed.format === "source_topic"
        ? parsed.format
        : undefined;
      if (forceComprehensive && parsed.difficulty !== REVIEW_PAPER_DIFFICULTY) {
        throw new Error("Exercise generator returned a paper without advanced difficulty");
      }
      if (forceComprehensive && (!format || !sections || sections.length < 2)) {
        throw new Error("Exercise generator returned an incomplete practical paper");
      }
      if (isFunctionStudy && format !== "comprehensive_function") {
        throw new Error("Exercise generator returned a non-function paper for a function study");
      }
      if (isPhysicsPaper && format !== "comprehensive_science") {
        throw new Error("Exercise generator returned a non-science paper for a physics request");
      }
      if (isSourceTopicPaper && format !== "source_topic") {
        throw new Error("Exercise generator returned a non-source paper for a multi-exercise topic");
      }
      const totalPoints = typeof parsed.totalPoints === "number"
        ? parsed.totalPoints
        : sections?.reduce((sum, section) => sum + section.points, 0) ?? 0;
      if (forceComprehensive && sections) {
        if (totalPoints <= 0 || totalPoints > 20 || sections.some((section) => section.prompt.includes("الحل النموذجي"))) {
          throw new Error("Exercise generator returned an invalid practical paper");
        }
      }
      if (isFunctionStudy && sections) {
        assertGroundedReviewPaperContract(
          sections as Array<{
            id: string;
            points: number;
            prompt: string;
            sourceNodeIds: string[];
            evidence: string;
          }>,
          totalPoints,
          retrieval.documents.map((document) => ({
            id: document.id,
            document: document.document ?? "",
          })),
        );
      }
      if (isPhysicsPaper && sections) {
        assertGroundedScienceReviewPaperContract(
          parsed.prompt,
          sections as Array<{
            id: string;
            points: number;
            prompt: string;
            sourceNodeIds: string[];
            evidence: string;
          }>,
          totalPoints,
          retrieval.documents.map((document) => ({
            id: document.id,
            document: document.document ?? "",
          })),
        );
      }
      if (isSourceTopicPaper && sections) {
        assertGroundedSourceTopicPaperContract(
          sections,
          totalPoints,
          retrieval.documents.map((document) => ({
            id: document.id,
            document: document.document ?? "",
          })),
        );
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
        ...(forceComprehensive ? { difficulty: REVIEW_PAPER_DIFFICULTY } : {}),
        ...(forceComprehensive && sections && format
          ? {
              format,
              totalPoints,
              sections,
            }
          : {}),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (attempt === 2) {
        if (error instanceof KnowledgeGroundingError) throw error;
        throw new Error(
          `Exercise generator failed contract validation after ${attempt} attempts: ${reason}`,
          { cause: error },
        );
      }
      lastValidationError = reason.slice(0, 400);
    }
  }

  throw new Error("Exercise generator exhausted contract-validation retries");
}

function buildGroundedExerciseFallback(
  lesson: string,
  activeConcept: string,
  retrieval: RetrievalContext,
  forceComprehensive: true,
  subject?: string,
  studentRequest?: string,
  exerciseIntent?: ExerciseIntent,
): GeneratedExercise | null;
function buildGroundedExerciseFallback(
  lesson: string,
  activeConcept: string,
  retrieval: RetrievalContext,
  forceComprehensive: false,
  subject?: string,
  studentRequest?: string,
  exerciseIntent?: ExerciseIntent,
): GeneratedExercise;
function buildGroundedExerciseFallback(
  lesson: string,
  activeConcept: string,
  retrieval: RetrievalContext,
  forceComprehensive: boolean,
  subject = "",
  studentRequest = "",
  exerciseIntent: ExerciseIntent = "standard",
): GeneratedExercise | null {
  const documents = retrieval.documents
    .filter(
      (document) =>
        typeof document.document === "string" && document.document.trim(),
    )
    .slice()
    .sort((left, right) => {
      const priority = (document: KnowledgeDocument) => {
        const type = String(document.metadata?.content_type || "").toLowerCase();
        return ["exercise", "assessment", "solution"].includes(type) ? 0 : 1;
      };
      return priority(left) - priority(right);
    })
    .slice(0, 3);
  const primary = documents[0];
  const metadata = primary?.metadata ?? {};
  const topic =
    activeConcept.trim() || lesson.trim() || String(metadata.lesson || metadata.unit || lesson);
  const isPhysicsRequest =
    /فيزياء|فيزيائي|physics|physique/i.test(`${subject} ${lesson} ${topic}`);
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
    forceComprehensive &&
    !isPhysicsRequest &&
    exerciseIntent !== "multi_topic" &&
    FUNCTION_REQUEST_PATTERN.test(studentRequest);
  const isComprehensive = forceComprehensive;
  const isPhysicsPaper = isComprehensive && isPhysicsRequest;
  const isSourceTopicPaper =
    isComprehensive && !isFunctionStudy && !isPhysicsPaper;
  const scientificScenario = isPhysicsPaper
    ? selectGroundedScientificScenario(retrieval.documents, topic, subject)
    : undefined;
  if (isPhysicsPaper && !scientificScenario) {
    return null;
  }
  const sourceDocuments = scientificScenario
    ? [
        scientificScenario.source,
        ...documents.filter((document) => document.id !== scientificScenario.source.id),
      ]
    : documents;
  const primarySourceId = scientificScenario?.source.id ?? documents[0]?.id ?? "";
  const groundedEvidence =
    scientificScenario?.evidence ||
    documents[0]?.document?.trim().slice(0, 600) ||
    "المصدر المسترجع يحدد محور الدرس والمفاهيم المطلوب دراستها.";
  type FallbackSection = NonNullable<GeneratedExercise["sections"]>[number];
  const sourceTopicSections = isSourceTopicPaper
    ? documents.flatMap((document) => {
        const text = document.document?.trim() ?? "";
        const markers = [...text.matchAll(/(?:ال)?تمرين\s*[0-9٠-٩]+/giu)];
        return markers.slice(0, 8).map((marker, index) => {
          const start = marker.index ?? 0;
          const end = markers[index + 1]?.index ?? text.length;
          const title = marker[0].replace(/\s+/g, " ").trim();
          const prompt = text
            .slice(start + marker[0].length, end)
            .replace(/\s+/g, " ")
            .trim();
          return {
            id: `${document.id}-section-${index + 1}`,
            title,
            points: 1,
            prompt: prompt.slice(0, 1200),
            sourceNodeIds: [document.id],
            evidence: prompt.slice(0, 220),
          };
        }).filter((section) => section.prompt.length >= 20);
      })
    : [];
  if (isSourceTopicPaper && sourceTopicSections.length < 2) {
    return null;
  }
  const fallbackPointBase = sourceTopicSections.length
    ? Math.floor(20 / sourceTopicSections.length)
    : 0;
  const fallbackPointRemainder = sourceTopicSections.length
    ? 20 % sourceTopicSections.length
    : 0;
  const groundedSourceTopicSections = sourceTopicSections.map((section, index) => ({
    ...section,
    points: fallbackPointBase + (index < fallbackPointRemainder ? 1 : 0),
  }));
  const sections: FallbackSection[] = !isComprehensive
    ? []
    : isFunctionStudy
    ? [
        ["domain", "D_f · مجموعة التعريف | Domaine", "اكتب مجموعة تعريف الدالة، وحدد القيم الممنوعة وسبب منعها."],
        ["limits", "lim · النهايات | Limites", "احسب النهايات عند حدود مجال التعريف واستنتج المقاربات الممكنة."],
        ["derivative", "f′ · الاشتقاق | Dérivée", "احسب المشتقة وبسّطها، ثم اذكر قواعد الاشتقاق المستعملة."],
        ["variations", "Δf · اتجاه التغيرات | Variations", "ادرس إشارة المشتقة وأنجز جدول التغيرات مع تبرير الاتجاهات."],
        ["equations", "E_f · المعادلات والمتراجحات | Équations · Inéquations", "حل المعادلة المرتبطة بالدالة واستعمل الإشارة لحل المتراجحة."],
        ["relative-position", "C_f/Δ · الوضع النسبي | Position relative", "ادرس وضع المنحنى بالنسبة إلى المقارب وحدد نقاط التقاطع."],
        ["horizontal-discussion", "المناقشة الأفقية | Discussion horizontale", "ناقش عدد حلول المعادلة الأفقية المرتبطة بالمنحنى."],
        ["oblique-discussion", "المناقشة المائلة | Discussion oblique", "ناقش الوضع النسبي بالنسبة إلى المقارب المائل إن وُجد."],
        ["graph", "C_f · التمثيل البياني | Courbe", "أنشئ المنحنى موضحًا المقاربات والمماس ونقاط التقاطع الأساسية."],
        ["synthesis", "Σ · تركيب شامل | Synthèse", "رتّب نتائج الدراسة في خلاصة واحدة واربط الحساب بالتمثيل البياني."],
      ].map(([id, title, prompt]) => ({
        id,
        title,
        points: 2,
        prompt,
        sourceNodeIds: primarySourceId ? [primarySourceId] : [],
        evidence: groundedEvidence,
      }))
    : isPhysicsPaper
    ? [
        {
          id: "data",
          title: "data",
          points: 3,
          prompt: "أ) عيّن المعطيات اللازمة للحل. ب) اكتب الرموز والوحدات المستعملة.",
          sourceNodeIds: primarySourceId ? [primarySourceId] : [],
          evidence: groundedEvidence,
        },
        {
          id: "law",
          title: "principle",
          points: 4,
          prompt: "أ) اكتب العلاقة أو القانون المناسب. ب) عوّض بالمعطيات. ج) استنتج النتيجة.",
          sourceNodeIds: primarySourceId ? [primarySourceId] : [],
          evidence: groundedEvidence,
        },
        {
          id: "calculation",
          title: "application",
          points: 5,
          prompt: "أ) احسب الكمية المطلوبة. ب) استنتج الكمية التابعة لها. ج) اكتب النتيجة بالوحدة المناسبة.",
          sourceNodeIds: primarySourceId ? [primarySourceId] : [],
          evidence: groundedEvidence,
        },
        {
          id: "interpretation",
          title: "interpretation",
          points: 4,
          prompt: "أ) بيّن طبيعة النتيجة. ب) تحقق من التجانس البعدي. ج) قارن النتيجة بالمعطيات.",
          sourceNodeIds: primarySourceId ? [primarySourceId] : [],
          evidence: groundedEvidence,
        },
        {
          id: "synthesis",
          title: "synthesis",
          points: 4,
          prompt: "استنتج النتيجة النهائية للموضوع، مع كتابة العلاقة والنتيجة العددية إن وجدت.",
          sourceNodeIds: primarySourceId ? [primarySourceId] : [],
          evidence: groundedEvidence,
        },
      ]
    : groundedSourceTopicSections

  return {
    status: "generated",
    lessonTitle: lesson,
    title: isComprehensive ? `ورقة تدريب موثقة: ${topic}` : `تمرين موثق: ${topic}`,
    prompt: isComprehensive && isPhysicsPaper && scientificScenario
      ? [
          `المسألة: ${topic}`,
          "الوضعية والمعطيات:",
          scientificScenario.text,
          "أجب عن المطلوبات الخمسة بالترتيب، مع كتابة العلاقة والتعويض والوحدة والتحقق من النتيجة.",
        ].join("\n\n")
      : isComprehensive && isFunctionStudy
      ? "أنجز دراسة الدالة وفق ترتيب المحاور، واكتب التبريرات كاملة."
      : isComprehensive && isSourceTopicPaper
      ? `أنجز الموضوع «${topic}» باتباع ترتيب الأقسام والمطلوبات كما وردت في المصدر، واكتب كل تمرين أو فرع في موضعه.`
      : isComprehensive
      ? "أنجز الورقة بالقلم، واكتب المعطيات والتحويلات والتبريرات كاملة."
       : `اعتمد على المقتطفات المسترجعة من «${sourceLabel}» حول ${topic}. استخرج المعطيات والوحدات، واختر العلاقة المناسبة، ثم احسب المطلوب واكتب النتيجة مع وحدتها.`,
     answer: "الحل غير معروض في ورقة الطالب. ارفع محاولتك للحصول على توجيه بعد المراجعة.",
     hint: `ابدأ من «${sourceLabel}» وحدد المعطيات اللازمة لكل محور.`,
     solution: "الحل غير معروض في ورقة الطالب. ارفع محاولتك للحصول على توجيه بعد المراجعة.",
    sourceDocuments: sourceDocumentsFrom(sourceDocuments),
    sourceNodeIds: sourceDocuments.map((document) => document.id),
    grounding: retrieval.grounding,
    ...(isComprehensive
      ? {
           difficulty: REVIEW_PAPER_DIFFICULTY,
           format: isFunctionStudy
             ? "comprehensive_function" as const
             : isPhysicsPaper
               ? "comprehensive_science" as const
               : "source_topic" as const,
          totalPoints: sections.reduce((sum, section) => sum + section.points, 0),
          sections,
        }
      : {}),
    fallback: true,
     fallbackMessage: isComprehensive
       ? isSourceTopicPaper
         ? "هذه ورقة تدريب تحافظ على ترتيب الموضوع المستخرج من المصادر."
         : "هذه ورقة تدريب مبنية على مادة الدرس المتاحة."
      : "هذا تمرين موجز مبني على مادة الدرس المتاحة.",
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
    studentRequest,
    mode,
    studentRequestedPaper,
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
    (studentRequest !== undefined && typeof studentRequest !== "string") ||
    (mode !== undefined && mode !== "standard" && mode !== "paper" && mode !== "creative_topic") ||
    (studentRequestedPaper !== undefined && typeof studentRequestedPaper !== "boolean")
  ) {
    res.status(400).json({ error: "invalid_exercise_generation_payload" });
    return;
  }
  let retrieval: RetrievalContext | undefined;
  const requestText = typeof studentRequest === "string" ? studentRequest.trim() : "";
  const exerciseIntent = classifyExerciseIntent(
    requestText,
    mode,
    studentRequestedPaper === true,
  );
  const isPaperRequest = exerciseIntent === "multi_topic";
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
      requestText,
      exerciseIntent,
      isPaperRequest,
      retrieval,
    );
    if (isPaperRequest) {
      assertReviewPaperDifficulty(generated.difficulty);
      const studentPaper: StudentPaper = {
        status: generated.status,
        mode: "paper",
        lessonTitle: generated.lessonTitle,
        title: generated.title,
        prompt: generated.prompt,
        difficulty: generated.difficulty,
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
      shouldUseGroundedProviderFallback(error) &&
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
      isPaperRequest &&
      error instanceof DeepSeekProviderError &&
      shouldUseGroundedProviderFallback(error) &&
      retrieval
    ) {
      req.log.warn(
        { status: error.status },
        "Returning grounded paper fallback after temporary provider failure",
      );
      const fallback = buildGroundedExerciseFallback(
        lesson,
        typeof activeConcept === "string" ? activeConcept : "",
        retrieval,
        true,
        typeof subject === "string" ? subject : "",
        requestText,
        exerciseIntent,
      );
      if (!fallback) {
        const physicsPaper = /فيزياء|فيزيائي|physics|physique/i.test(
          `${subject ?? ""} ${lesson} ${typeof activeConcept === "string" ? activeConcept : ""}`,
        );
        res.status(424).json({
          error: physicsPaper
            ? "grounded_physics_problem_unavailable"
            : "grounded_source_topic_unavailable",
          message: physicsPaper
            ? "لم أعثر في المصادر المتاحة على مسألة فيزيائية بمعطيات عددية ووحدات كافية لبناء ورقة قابلة للحل. حدّد درسًا أو مفهومًا أدق ثم أعد المحاولة."
            : "لم أعثر في المصادر المتاحة على بنية موضوع متعددة التمارين قابلة للحل. حدّد مصدرًا أو موضوعًا أدق ثم أعد المحاولة.",
        });
        return;
      }
      assertReviewPaperDifficulty(fallback.difficulty);
      if (!fallback.format || fallback.totalPoints === undefined || !fallback.sections) {
        throw new Error("Grounded paper fallback did not match the paper contract");
      }
      if (fallback.format === "comprehensive_function") {
        assertGroundedReviewPaperContract(
          fallback.sections as Array<{
            id: string;
            points: number;
            prompt: string;
            sourceNodeIds: string[];
            evidence: string;
          }>,
          fallback.totalPoints ?? 0,
          retrieval.documents.map((document) => ({
            id: document.id,
            document: document.document ?? "",
          })),
        );
      } else if (fallback.format === "comprehensive_science") {
        assertGroundedScienceReviewPaperContract(
          fallback.prompt,
          fallback.sections as Array<{
            id: string;
            points: number;
            prompt: string;
            sourceNodeIds: string[];
            evidence: string;
          }>,
          fallback.totalPoints,
          retrieval.documents.map((document) => ({
            id: document.id,
            document: document.document ?? "",
          })),
        );
      } else {
        assertGroundedSourceTopicPaperContract(
          fallback.sections as Array<{
            id: string;
            title: string;
            points: number;
            prompt: string;
            sourceNodeIds: string[];
            evidence: string;
          }>,
          fallback.totalPoints,
          retrieval.documents.map((document) => ({
            id: document.id,
            document: document.document ?? "",
          })),
        );
      }
      res.json({
        status: fallback.status,
        mode: "paper",
        lessonTitle: fallback.lessonTitle,
        title: fallback.title,
        prompt: fallback.prompt,
        difficulty: fallback.difficulty,
        format: fallback.format,
        totalPoints: fallback.totalPoints,
        sections: fallback.sections.map((section) => ({
          id: section.id,
          title: section.title,
          points: section.points,
          prompt: section.prompt,
        })),
        fallback: true,
        fallbackMessage:
          "تعذر تشغيل التوليد مؤقتًا؛ هذه ورقة مراجعة مبنية على المصادر المتاحة.",
      } satisfies StudentPaper);
      return;
    }
    if (
      error instanceof DeepSeekProviderError &&
      shouldUseGroundedProviderFallback(error) &&
      retrieval &&
      !isPaperRequest
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
        typeof subject === "string" ? subject : "",
        requestText,
        exerciseIntent,
      );
      res.json(studentExerciseView(fallback));
      return;
    }
    const contractFailure = errorMessage.startsWith(
      "Exercise generator failed contract validation after",
    );
    const message = contractFailure
      ? errorMessage.includes("incomplete practical paper")
        ? "لم تكتمل بنية الورقة العملية بعد محاولتي توليد. أعد المحاولة، أو اختر تمرينًا عاديًا بدل الورقة الكاملة."
        : errorMessage.includes("invalid practical paper")
          ? "أنتج النموذج ورقة عملية غير مستوفية لشروط العلامات أو عرض الأسئلة بعد محاولتي تصحيح. أعد المحاولة أو اختر تمرينًا عاديًا."
          : errorMessage.includes("without advanced difficulty")
            ? "لم تصل الورقة إلى مستوى الصعوبة المتقدم المطلوب بعد محاولتي توليد. أعد المحاولة."
            : "لم يكتمل تركيب التمرين بعد محاولتي توليد. جرّب موضوعًا أضيق أو أعد المحاولة."
      : errorMessage.includes("XAI_CONNECTION_NOT_CONFIGURED")
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
          : contractFailure
            ? "exercise_generation_contract_failed"
            : "exercise_generation_failed",
      message,
    });
  }
});

export default router;
