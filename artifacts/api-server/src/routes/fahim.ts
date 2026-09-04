import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  formatRetrievedContext,
  retrieveGroundedKnowledge,
  KnowledgeGroundingError,
  type RetrievalContext,
} from "../lib/rag";
import {
  FRIENDLY_TUTOR_PROMPT,
  GROUNDED_CONTENT_RULES,
} from "../lib/ai-prompts";

const router: IRouter = Router();
const connectors = new ReplitConnectors();

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Provider request timed out after ${milliseconds}ms`));
    }, milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

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

async function callVisionModel(
  imageDataUrl: string,
  lesson: string,
  concept: string,
  retrieval: RetrievalContext,
) {
  const sourceText = formatRetrievedContext(retrieval.documents);
  const response = await withTimeout(
    connectors.proxy("xai", "/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROK_VISION_MODEL ?? "grok-2-vision-1212",
        temperature: 0,
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content: [
              FRIENDLY_TUTOR_PROMPT,
              GROUNDED_CONTENT_RULES,
              "أنت فهيم، مساعد تربوي يقرأ محاولات الطلاب. لا تخمّن ما لا يظهر في الصورة. حدّد أول خطوة خاطئة فقط، واذكر آخر خطوة صحيحة قبلها، ثم قدّم تغذية راجعة وتمرينًا واحدًا يعالج الخطأ.",
              "هذه الواجهة تحتاج JSON داخليًا، فلا تضف نصًا خارج الكائن المطلوب.",
            ].join("\n\n"),
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `حلّل محاولة الطالب المصورة في درس "${lesson}" ومفهوم "${concept}". حدد أول خطوة خاطئة فقط، وآخر خطوة صحيحة قبلها، ثم اقترح تمرينًا واحدًا يعالج نفس الخطأ من العقد المرفقة. أعد JSON فقط بهذه المفاتيح: firstError, firstErrorStep, lastCorrectStep, feedback, nextExercise, summaryAnchor.\nعقد المعرفة المسترجعة من ChromaDB:\n${sourceText}`,
              },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    }),
    30000,
  );
  if (!response.ok) throw new Error(`Vision provider responded with ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Vision provider returned no analysis");
  return extractJson(content);
}

async function callTextModel(
  question: string,
  lesson: string,
  concept: string,
  context: string,
  retrieval: RetrievalContext,
) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");
  const sourceText = formatRetrievedContext(retrieval.documents);

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
          content: [
            FRIENDLY_TUTOR_PROMPT,
            GROUNDED_CONTENT_RULES,
            "أنت فهيم، مساعد تثبيت المفاهيم في منصة توجيه. اسأل سؤالًا قصيرًا عند الحاجة، ولا تعطِ الحل كاملًا قبل أن تحاول كشف خطوة الطالب. أجب مباشرة وباختصار مناسب للسياق.",
          ].join("\n\n"),
        },
        {
          role: "user",
          content: `الدرس: ${lesson}\nالمفهوم: ${concept}\nسياق المحاولة والتحليل: ${context || "لا توجد محاولة محللة"}\nسؤال الطالب: ${question}\n\nعقد المعرفة المسترجعة من ChromaDB:\n${sourceText}`,
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
    const retrieval = await retrieveGroundedKnowledge(`${lesson} ${concept}`, { nResults: 8 });
    const analysis = await callVisionModel(imageDataUrl, lesson, concept, retrieval);
    res.json({ ...analysis, grounding: retrieval.grounding });
  } catch (error) {
    req.log.error({ error }, "Fahim attempt analysis failed");
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "fahim_analysis_failed",
      message: "لا يمكن تحليل المحاولة قبل نجاح استرجاع عقد المعرفة من ChromaDB.",
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
    const retrieval = await retrieveGroundedKnowledge(`${lesson} ${concept} ${question}`, { nResults: 8 });
    const answer = await callTextModel(
      question,
      lesson,
      concept,
      typeof context === "string" ? context : "",
      retrieval,
    );
    res.json({ answer, grounding: retrieval.grounding });
  } catch (error) {
    req.log.error({ error }, "Fahim message failed");
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "fahim_message_failed",
      message: "لا يمكن أن يجيب فهيم قبل نجاح استرجاع عقد المعرفة من ChromaDB.",
    });
  }
});

export default router;