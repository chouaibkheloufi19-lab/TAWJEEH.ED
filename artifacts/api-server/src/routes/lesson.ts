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

async function queryKnowledge(query: string) {
  const response = await fetch(`${knowledgeBaseUrl}/v1/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, n_results: 8 }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`Knowledge service responded with ${response.status}`);
  return (await response.json()) as {
    results?: Array<{
      document?: string;
      metadata?: Record<string, string | number>;
    }>;
  };
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
            "أنت مخطط درس عربي دقيق لمنصة تعليمية جزائرية. ابنِ شرحًا متزامنًا من المصادر التي أرسلها المستخدم فقط. لا تخترع عناوين دروس أو معلومات خارج المصادر. أعد JSON فقط. اجعل العناصر قصيرة، وكل عنصر يمثل خطوة واضحة في التعلم. أضف تمثيلًا بيانيًا رقميًا عندما يسمح المفهوم بذلك، وإلا أعد graph.type = none.",
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
    const documents = (payload.results ?? []).slice(0, 5).map((item) => {
      const metadata = item.metadata ?? {};
      return {
        title: String(metadata.lesson || metadata.unit || "مصدر تعليمي"),
        source: String(metadata.source_file || "مصدر غير محدد"),
        page: Number(metadata.source_page || 0),
      };
    });
    res.json({ ...generated, sourceDocuments: generated.sourceDocuments.length ? generated.sourceDocuments : documents });
  } catch (error) {
    req.log.error({ error }, "Lesson generation failed");
    res.status(502).json({
      error: "lesson_generation_failed",
      message: "تعذر توليد الدرس من المستندات الآن. تحقق من اتصال المعرفة ثم حاول مرة أخرى.",
    });
  }
});

export default router;