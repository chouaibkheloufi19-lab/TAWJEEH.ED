import { Router, type IRouter } from "express";

const router: IRouter = Router();

type AttemptAnalysis = {
  status: "analyzed";
  firstError: string;
  firstErrorStep: string;
  lastCorrectStep: string;
  feedback: string;
  nextExercise: string;
  summaryAnchor: string;
};

function extractJson(text: string): AttemptAnalysis {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("Fahim returned a non-JSON analysis");
  const parsed = JSON.parse(candidate) as Partial<AttemptAnalysis>;
  const fields: Array<keyof Omit<AttemptAnalysis, "status">> = [
    "firstError",
    "firstErrorStep",
    "lastCorrectStep",
    "feedback",
    "nextExercise",
    "summaryAnchor",
  ];
  if (fields.some((field) => typeof parsed[field] !== "string" || !parsed[field]?.trim())) {
    throw new Error("Fahim returned an incomplete analysis");
  }
  return { status: "analyzed", ...(parsed as Omit<AttemptAnalysis, "status">) };
}

async function callVisionModel(imageDataUrl: string, lesson: string, concept: string) {
  const key = process.env.GROK_API_KEY;
  if (!key) throw new Error("GROK_API_KEY is not configured");

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.GROK_VISION_MODEL ?? "grok-2-vision-1212",
      temperature: 0,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "أنت فهيم، مساعد تربوي يقرأ محاولات الطلاب. أجب بالعربية الواضحة. لا تخمّن ما لا يظهر في الصورة، واذكر أن الصورة غير كافية إذا لزم.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `حلّل محاولة الطالب المصورة في درس "${lesson}" ومفهوم "${concept}". حدد أول خطوة خاطئة فقط، وآخر خطوة صحيحة قبلها، ثم اقترح تمرينًا واحدًا يعالج نفس الخطأ. أعد JSON فقط بهذه المفاتيح: firstError, firstErrorStep, lastCorrectStep, feedback, nextExercise, summaryAnchor.`,
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Vision provider responded with ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Vision provider returned no analysis");
  return extractJson(content);
}

async function callTextModel(question: string, lesson: string, concept: string, context: string) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content:
            "أنت فهيم، مساعد تثبيت المفاهيم في منصة توجيه. اشرح بالعربية، اسأل سؤالًا قصيرًا عند الحاجة، ولا تعطِ الحل كاملًا قبل أن تحاول كشف خطوة الطالب.",
        },
        {
          role: "user",
          content: `الدرس: ${lesson}\nالمفهوم: ${concept}\nسياق المحاولة والتحليل: ${context || "لا توجد محاولة محللة"}\nسؤال الطالب: ${question}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Text provider responded with ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Text provider returned no answer");
  return content;
}

router.post("/fahim/analyze-attempt", async (req, res): Promise<void> => {
  const { imageDataUrl, lesson, concept } = req.body as {
    imageDataUrl?: unknown;
    lesson?: unknown;
    concept?: unknown;
  };
  if (
    typeof imageDataUrl !== "string" ||
    !imageDataUrl.startsWith("data:image/") ||
    imageDataUrl.length > 7_000_000 ||
    typeof lesson !== "string" ||
    typeof concept !== "string"
  ) {
    res.status(400).json({ error: "invalid_attempt_payload" });
    return;
  }

  try {
    const analysis = await callVisionModel(imageDataUrl, lesson, concept);
    res.json(analysis);
  } catch (error) {
    req.log.error({ error }, "Fahim attempt analysis failed");
    res.status(502).json({
      error: "fahim_analysis_failed",
      message: "تعذر قراءة المحاولة الآن. احتفظت بالصورة ويمكنك إعادة التحليل.",
    });
  }
});

router.post("/fahim/message", async (req, res): Promise<void> => {
  const { question, lesson, concept, context } = req.body as Record<string, unknown>;
  if (
    typeof question !== "string" ||
    !question.trim() ||
    typeof lesson !== "string" ||
    typeof concept !== "string" ||
    (context !== undefined && typeof context !== "string")
  ) {
    res.status(400).json({ error: "invalid_message_payload" });
    return;
  }

  try {
    const answer = await callTextModel(question, lesson, concept, typeof context === "string" ? context : "");
    res.json({ answer });
  } catch (error) {
    req.log.error({ error }, "Fahim message failed");
    res.status(502).json({
      error: "fahim_message_failed",
      message: "تعذر الحصول على رد فهيم الآن. حاول مرة أخرى.",
    });
  }
});

export default router;