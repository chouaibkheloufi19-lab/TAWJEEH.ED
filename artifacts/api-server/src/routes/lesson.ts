import { Router, type IRouter } from "express";

const router: IRouter = Router();
const knowledgeBaseUrl = (
  process.env.KNOWLEDGE_BASE_URL ?? "http://127.0.0.1:8001/knowledge"
).replace(/\/$/, "");

type GeneratedElement = {
  id: string;
  title: string;
  kind: "definition" | "example" | "graph" | "practice" | "recap";
  summary: string;
};

type GraphPoint = { x: number; y: number; label?: string };

type KnowledgeDocument = {
  document?: string;
  metadata?: Record<string, string | number>;
};

type SourceDocument = { title: string; source: string; page: number };

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
};

async function queryKnowledge(query: string) {
  const queries = [query, `الميكانيك القوة الكتلة التسارع تمارين ${query}`];
  let lastPayload: { results?: KnowledgeDocument[] } = { results: [] };
  for (const candidate of queries) {
    const response = await fetch(`${knowledgeBaseUrl}/v1/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: candidate, n_results: 8 }),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`Knowledge service responded with ${response.status}`);
    lastPayload = (await response.json()) as { results?: KnowledgeDocument[] };
    if (lastPayload.results?.length) return lastPayload;
  }
  return lastPayload;
}

function sourceDocumentsFrom(documents: KnowledgeDocument[]): SourceDocument[] {
  return documents.slice(0, 5).map((item) => {
    const metadata = item.metadata ?? {};
    return {
      title: String(metadata.lesson || metadata.unit || "مصدر تعليمي"),
      source: String(metadata.source_file || "مصدر غير محدد"),
      page: Number(metadata.source_page || 0),
    };
  });
}

function extractGeneratedLesson(text: string): GeneratedLesson {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("Lesson generator returned non-JSON content");
  const parsed = JSON.parse(candidate) as Partial<GeneratedLesson>;
  if (
    typeof parsed.lessonTitle !== "string" ||
    typeof parsed.objective !== "string" ||
    typeof parsed.explanation !== "string" ||
    typeof parsed.highlight !== "string" ||
    typeof parsed.prompt !== "string" ||
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
  };
}

async function generateLesson(
  lesson: string,
  level: string,
  activeConcept: string,
  attemptContext: string,
  documents: Array<{ document?: string; metadata?: Record<string, string | number> }>,
) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");
  const sourceText = documents
    .map((item, index) => {
      const metadata = item.metadata ?? {};
      return [
        `المصدر ${index + 1}: ${metadata.lesson || metadata.unit || "درس"}`,
        `المادة: ${metadata.subject || "غير محددة"}`,
        `الملف: ${metadata.source_file || "غير محدد"}، الصفحة: ${metadata.source_page || 0}`,
        `المحتوى: ${(item.document || "").slice(0, 1800)}`,
      ].join("\n");
    })
    .join("\n\n");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      temperature: 0.15,
      max_tokens: 1800,
      messages: [
        {
          role: "system",
          content:
            "أنت مخطط درس عربي دقيق لمنصة تعليمية جزائرية. ابنِ شرح درس «قوانين نيوتن والحركة» من المصادر التي أرسلها المستخدم فقط. لا تستبدل عنوان الدرس بعنوان آخر ولا تخترع معلومات خارج المصادر. أعد JSON فقط. استخدم الأرقام العادية 1, 2, 3 فقط، ولا تستخدم الأرقام العربية الشرقية. اجعل العناصر قصيرة، وكل عنصر يمثل خطوة واضحة في التعلم. أضف تمثيلًا بيانيًا رقميًا عندما يسمح المفهوم بذلك، وإلا أعد graph.type = none.",
        },
        {
          role: "user",
          content: [
            `عنوان الدرس المطلوب: ${lesson}`,
            `مستوى الطالب: ${level || "غير محدد"}`,
            `العنصر الحالي: ${activeConcept || "البداية"}`,
            `ملخص بنك الأخطاء: ${attemptContext || "لا توجد أخطاء محفوظة بعد"}`,
            "المصادر التعليمية:",
            sourceText || "لم تصل مصادر مفهرسة.",
            'أعد الشكل التالي حرفيًا: {"lessonTitle":"عنوان من المصادر","objective":"هدف قصير","elements":[{"id":"definition","title":"...","kind":"definition","summary":"..."},{"id":"example","title":"...","kind":"example","summary":"..."},{"id":"graph","title":"...","kind":"graph","summary":"..."},{"id":"practice","title":"...","kind":"practice","summary":"..."},{"id":"recap","title":"...","kind":"recap","summary":"..."}],"explanation":"شرح عربي قصير","highlight":"عبارة مهمة من الشرح","graph":{"type":"line","title":"عنوان الرسم","xLabel":"المحور الأفقي","yLabel":"المحور العمودي","points":[{"x":0,"y":0,"label":"..."}]},"prompt":"سؤال تفاعلي قصير","sourceDocuments":[{"title":"...","source":"...","page":1}]}',
          ].join("\n"),
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Lesson generator responded with ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Lesson generator returned no content");
  return extractGeneratedLesson(content);
}

async function generateExercise(
  lesson: string,
  level: string,
  activeConcept: string,
  attemptContext: string,
  documents: KnowledgeDocument[],
): Promise<GeneratedExercise> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");
  if (!documents.length) throw new Error("No indexed knowledge sources found");
  const sourceText = documents
    .map((item, index) => {
      const metadata = item.metadata ?? {};
      return [
        `المصدر ${index + 1}: ${metadata.lesson || metadata.unit || "درس"}`,
        `المادة: ${metadata.subject || "الفيزياء"}`,
        `الملف: ${metadata.source_file || "غير محدد"}، الصفحة: ${metadata.source_page || 0}`,
        `المحتوى: ${(item.document || "").slice(0, 2200)}`,
      ].join("\n");
    })
    .join("\n\n");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      temperature: 0.15,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "أنت مولّد تمارين عربي لمنصة توجيه. أنشئ تمرينًا واحدًا قابلًا للحل من درس «قوانين نيوتن والحركة» اعتمادًا على المصادر المرفقة فقط. لا تخترع قانونًا أو موضوعًا غير موجود في المصادر. أعد JSON فقط. استخدم الأرقام العادية 1, 2, 3 فقط، ولا تستخدم الأرقام العربية الشرقية. اجعل التمرين مناسبًا لمستوى الطالب، واكتب الإجابة والحل خطوة خطوة.",
        },
        {
          role: "user",
          content: [
            `عنوان الدرس: ${lesson}`,
            `مستوى الطالب: ${level || "غير محدد"}`,
            `المفهوم الحالي: ${activeConcept || "قوانين نيوتن والحركة"}`,
            `سياق الأخطاء السابقة: ${attemptContext || "لا توجد أخطاء محفوظة بعد"}`,
            "المصادر التعليمية من قاعدة المعرفة:",
            sourceText,
            'أعد الشكل التالي حرفيًا: {"lessonTitle":"قوانين نيوتن والحركة","title":"عنوان التمرين","prompt":"نص تمرين واحد واضح","answer":"الإجابة النهائية المختصرة","hint":"تلميح دون كشف الحل","solution":"الحل خطوة خطوة","sourceDocuments":[{"title":"...","source":"...","page":1}]}',
          ].join("\n"),
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Exercise generator responded with ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Exercise generator returned no content");
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
  ) {
    throw new Error("Exercise generator returned an incomplete exercise");
  }
  const generatedSources = Array.isArray(parsed.sourceDocuments)
    ? parsed.sourceDocuments.filter((source): source is SourceDocument => (
      Boolean(source) &&
      typeof source.title === "string" &&
      typeof source.source === "string" &&
      typeof source.page === "number"
    )).slice(0, 5)
    : [];
  return {
    status: "generated",
    lessonTitle: "قوانين نيوتن والحركة",
    title: parsed.title,
    prompt: parsed.prompt,
    answer: parsed.answer,
    hint: parsed.hint,
    solution: parsed.solution,
    sourceDocuments: generatedSources.length ? generatedSources : sourceDocumentsFrom(documents),
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
    const payload = await queryKnowledge(
      [lesson, activeConcept, attemptContext].filter((value): value is string => Boolean(value)).join(" "),
    );
    const generated = await generateLesson(
      lesson,
      typeof level === "string" ? level : "",
      typeof activeConcept === "string" ? activeConcept : "",
      typeof attemptContext === "string" ? attemptContext : "",
      payload.results ?? [],
    );
    const documents = sourceDocumentsFrom(payload.results ?? []);
    res.json({ ...generated, sourceDocuments: generated.sourceDocuments.length ? generated.sourceDocuments : documents });
  } catch (error) {
    req.log.error({ error }, "Lesson generation failed");
    res.status(502).json({
      error: "lesson_generation_failed",
      message: "تعذر توليد الدرس من المستندات الآن. تحقق من اتصال المعرفة ثم حاول مرة أخرى.",
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
    const payload = await queryKnowledge(
      [lesson, activeConcept, "تمارين قوانين نيوتن والحركة"].filter((value): value is string => Boolean(value)).join(" "),
    );
    const generated = await generateExercise(
      lesson,
      typeof level === "string" ? level : "",
      typeof activeConcept === "string" ? activeConcept : "",
      typeof attemptContext === "string" ? attemptContext : "",
      payload.results ?? [],
    );
    res.json(generated);
  } catch (error) {
    req.log.error({ error }, "Exercise generation failed");
    res.status(502).json({
      error: "exercise_generation_failed",
      message: "تعذر توليد تمرين من قاعدة المعرفة الآن. حاول مرة أخرى بعد لحظات.",
    });
  }
});

export default router;