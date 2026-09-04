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
  ADAPTIVE_EXERCISE_PROMPT,
  FRIENDLY_TUTOR_PROMPT,
  GROUNDED_CONTENT_RULES,
} from "../lib/ai-prompts";
import { callXaiTextModel } from "../lib/ai-provider";

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
};

function extractGeneratedLesson(
  text: string,
): Omit<GeneratedLesson, "grounding"> {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("Lesson generator returned non-JSON content");
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
    .filter((item): item is GeneratedElement => (
      Boolean(item) &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      typeof item.summary === "string" &&
      ["definition", "example", "graph", "practice", "recap"].includes(item.kind)
    ))
    .slice(0, 7);
  if (!elements.length) throw new Error("Lesson generator returned no valid elements");
  return {
    status: "generated",
    lessonTitle: parsed.lessonTitle,
    sourceDocuments: Array.isArray(parsed.sourceDocuments) ? parsed.sourceDocuments : [],
    objective: parsed.objective,
    elements,
    explanation: parsed.explanation,
    highlight: parsed.highlight,
    graph: {
      type: parsed.graph.type === "bar" ? "bar" : parsed.graph.type === "none" ? "none" : "line",
      title: parsed.graph.title,
      xLabel: typeof parsed.graph.xLabel === "string" ? parsed.graph.xLabel : "",
      yLabel: typeof parsed.graph.yLabel === "string" ? parsed.graph.yLabel : "",
      points: parsed.graph.points
        .filter((point): point is GraphPoint => Boolean(point) && typeof point.x === "number" && typeof point.y === "number")
        .slice(0, 12),
    },
    prompt: parsed.prompt,
    sourceNodeIds: parsed.sourceNodeIds.filter((nodeId): nodeId is string => typeof nodeId === "string"),
  };
}

async function generateLesson(
  lesson: string,
  level: string,
  activeConcept: string,
  attemptContext: string,
  retrieval: RetrievalContext,
) {
  const sourceText = formatRetrievedContext(retrieval.documents);
  const content = await callXaiTextModel(
    [
      {
        role: "system",
        content: [
          FRIENDLY_TUTOR_PROMPT,
          GROUNDED_CONTENT_RULES,
          "أنت مخطط درس عربي دقيق لمنصة تعليمية جزائرية. اجعل العناصر قصيرة، وكل عنصر يمثل خطوة واضحة في التعلم. أضف تمثيلًا بيانيًا رقميًا فقط عندما تسمح به البيانات المسترجعة، وإلا أعد graph.type = none. استخدم الأرقام العادية 1, 2, 3 فقط، ولا تستخدم الأرقام العربية الشرقية.",
          "هذه الواجهة تحتاج JSON فقط؛ ضع الشرح والتمثيل التعليمي داخل الحقول المطلوبة ولا تضف أي نص خارج الكائن.",
        ].join("\n\n"),
      },
      {
        role: "user",
        content: [
          `عنوان الدرس المطلوب: ${lesson}`,
          `مستوى الطالب: ${level || "غير محدد"}`,
          `العنصر الحالي: ${activeConcept || "البداية"}`,
          `ملخص بنك الأخطاء: ${attemptContext || "لا توجد أخطاء محفوظة بعد"}`,
          "عقد المتجه المسترجعة من ChromaDB:",
          sourceText,
          'أعد الشكل التالي حرفيًا، وأضف sourceNodeIds بمعرّفات العقد المستخدمة: {"lessonTitle":"عنوان من المصادر","objective":"هدف قصير","elements":[{"id":"definition","title":"...","kind":"definition","summary":"..."},{"id":"example","title":"...","kind":"example","summary":"..."},{"id":"graph","title":"...","kind":"graph","summary":"..."},{"id":"practice","title":"...","kind":"practice","summary":"..."},{"id":"recap","title":"...","kind":"recap","summary":"..."}],"explanation":"شرح عربي قصير","highlight":"عبارة مهمة من الشرح","graph":{"type":"line","title":"عنوان الرسم","xLabel":"المحور الأفقي","yLabel":"المحور العمودي","points":[{"x":0,"y":0,"label":"..."}]},"prompt":"سؤال تفاعلي قصير","sourceNodeIds":["node-id"]}',
        ].join("\n"),
      },
    ],
    { temperature: 0.15, maxOutputTokens: 1800 },
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
  activeConcept: string,
  attemptContext: string,
  retrieval: RetrievalContext,
): Promise<GeneratedExercise> {
  const sourceText = formatRetrievedContext(retrieval.documents);
  const content = await callXaiTextModel(
    [
      {
        role: "system",
        content: [
          ADAPTIVE_EXERCISE_PROMPT,
          GROUNDED_CONTENT_RULES,
          "أنت وكيل تمارين عربي لمنصة توجيه. أنشئ تمرينًا واحدًا قابلًا للحل يعالج الخطأ الأهم في السجل المرفق. أخفِ الإجابة في الحقول المخصصة لها، واجعل التلميح لا يكشف الحل. يجب أن يكون الحل خطوة خطوة ومربوطًا بمعرّفات العقد في sourceNodeIds. استخدم الأرقام العادية 1, 2, 3 فقط، ولا تستخدم الأرقام العربية الشرقية.",
          "هذه الواجهة تحتاج JSON فقط؛ لا تضف أي نص خارج الكائن.",
        ].join("\n\n"),
      },
      {
        role: "user",
        content: [
          `عنوان الدرس: ${lesson}`,
          `مستوى الطالب: ${level || "غير محدد"}`,
          `المفهوم الحالي: ${activeConcept || "قوانين نيوتن والحركة"}`,
          `سياق الأخطاء السابقة: ${attemptContext || "لا توجد أخطاء محفوظة بعد"}`,
          "عقد المتجه المسترجعة من ChromaDB:",
          sourceText,
          'أعد الشكل التالي حرفيًا، وأضف sourceNodeIds بمعرّفات العقد المستخدمة: {"lessonTitle":"عنوان من المصادر","title":"عنوان التمرين","prompt":"نص تمرين واحد واضح","answer":"الإجابة النهائية المختصرة","hint":"تلميح دون كشف الحل","solution":"الحل خطوة خطوة","sourceNodeIds":["node-id"]}',
        ].join("\n"),
      },
    ],
    { temperature: 0.15, maxOutputTokens: 1200 },
  );
  const candidate = content.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("Exercise generator returned non-JSON content");
  const parsed = JSON.parse(candidate) as Partial<GeneratedExercise>;
  if (
    typeof parsed.lessonTitle !== "string" ||
    typeof parsed.title !== "string" ||
    typeof parsed.prompt !== "string" ||
    typeof parsed.answer !== "string" ||
    typeof parsed.hint !== "string" ||
    typeof parsed.solution !== "string"
    || !Array.isArray(parsed.sourceNodeIds)
  ) {
    throw new Error("Exercise generator returned an incomplete exercise");
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
  };
}

router.post("/lesson/generate", async (req, res): Promise<void> => {
  const { lesson, level, activeConcept, attemptContext } = req.body as Record<string, unknown>;
  if (
    typeof lesson !== "string" ||
    lesson.trim().length < 2 ||
    (level !== undefined && typeof level !== "string") ||
    (activeConcept !== undefined && typeof activeConcept !== "string") ||
    (attemptContext !== undefined && typeof attemptContext !== "string")
  ) {
    res.status(400).json({ error: "invalid_lesson_generation_payload" });
    return;
  }
  try {
    const retrieval = await retrieveGroundedKnowledge(
      [lesson, activeConcept, attemptContext].filter((value): value is string => Boolean(value)).join(" "),
    );
    const generated = await generateLesson(
      lesson,
      typeof level === "string" ? level : "",
      typeof activeConcept === "string" ? activeConcept : "",
      typeof attemptContext === "string" ? attemptContext : "",
      retrieval,
    );
    res.json(generated);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    req.log.error({ error: errorMessage }, "Lesson generation failed");
    const message = errorMessage.includes("DEEPSEEK_API_KEY")
      ? "لم يتم إعداد مزود الذكاء الاصطناعي بعد."
      : errorMessage.startsWith("Lesson generator responded with")
        ? "تعذر الاتصال بمزود الذكاء الاصطناعي. تحقق من صلاحية المفتاح ورصيده ثم أعد المحاولة."
        : "تعذر توليد شرح الدرس من المصادر حاليًا. أعد المحاولة بعد قليل.";
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "lesson_generation_failed",
      message,
    });
  }
});

router.post("/lesson/exercise", async (req, res): Promise<void> => {
  const { lesson, level, activeConcept, attemptContext } = req.body as Record<string, unknown>;
  if (
    typeof lesson !== "string" ||
    lesson.trim().length < 2 ||
    (level !== undefined && typeof level !== "string") ||
    (activeConcept !== undefined && typeof activeConcept !== "string") ||
    (attemptContext !== undefined && typeof attemptContext !== "string")
  ) {
    res.status(400).json({ error: "invalid_exercise_generation_payload" });
    return;
  }
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const errorBank = await listErrorBank(userId);
    const historicalErrors = errorBank.errors
      .slice(0, 12)
      .map((error) => `${error.concept_title}: ${error.error_tag}`)
      .join(" | ");
    const retrieval = await retrieveGroundedKnowledge(
      [lesson, activeConcept, historicalErrors, "تمارين"].filter((value): value is string => Boolean(value)).join(" "),
    );
    const generated = await generateExercise(
      lesson,
      typeof level === "string" ? level : "",
      typeof activeConcept === "string" ? activeConcept : "",
      [typeof attemptContext === "string" ? attemptContext : "", historicalErrors].filter(Boolean).join(" | "),
      retrieval,
    );
    res.json(generated);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    req.log.error({ error: errorMessage }, "Exercise generation failed");
    const message = errorMessage.includes("DEEPSEEK_API_KEY")
      ? "لم يتم إعداد مزود الذكاء الاصطناعي بعد."
      : errorMessage.startsWith("Exercise generator responded with")
        ? "تعذر الاتصال بمزود الذكاء الاصطناعي. تحقق من صلاحية المفتاح ورصيده ثم أعد المحاولة."
        : "تعذر توليد التمرين من المصادر حاليًا. أعد المحاولة بعد قليل.";
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "exercise_generation_failed",
      message,
    });
  }
});

export default router;