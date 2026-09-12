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
import { callDeepSeekTextModel } from "../lib/ai-provider";

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
  errorArea: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
  };
};

type FahimWhiteboardAction = {
  action: "draw_diagram" | "type_text" | "highlight_area";
  details: Record<string, unknown>;
};

export type FahimResponse = {
  speech_text: string;
  chat_response: string;
  whiteboard_actions: FahimWhiteboardAction[];
  evaluated_skill: string;
  mastery_score: number;
};

const whiteboardActions = new Set<FahimWhiteboardAction["action"]>([
  "draw_diagram",
  "type_text",
  "highlight_area",
]);

function normalizeFahimResponse(value: unknown, fallbackSkill: string): FahimResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Fahim returned an invalid response");
  }
  const candidate = value as Partial<FahimResponse>;
  if (
    typeof candidate.speech_text !== "string"
    || typeof candidate.chat_response !== "string"
    || typeof candidate.evaluated_skill !== "string"
    || typeof candidate.mastery_score !== "number"
    || !Number.isFinite(candidate.mastery_score)
  ) {
    throw new Error("Fahim returned an incomplete response");
  }
  const actions = Array.isArray(candidate.whiteboard_actions)
    ? candidate.whiteboard_actions.filter((item): item is FahimWhiteboardAction => Boolean(
        item
        && typeof item === "object"
        && whiteboardActions.has((item as FahimWhiteboardAction).action)
        && (item as FahimWhiteboardAction).details
        && typeof (item as FahimWhiteboardAction).details === "object",
      ))
    : [];
  return {
    speech_text: candidate.speech_text.trim(),
    chat_response: candidate.chat_response.trim(),
    whiteboard_actions: actions,
    evaluated_skill: candidate.evaluated_skill.trim() || fallbackSkill,
    mastery_score: Math.max(0, Math.min(100, Math.round(candidate.mastery_score))),
  };
}

function extractFahimResponse(text: string, fallbackSkill: string): FahimResponse {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("Fahim returned a non-JSON response");
  return normalizeFahimResponse(JSON.parse(candidate), fallbackSkill);
}

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
  const errorArea = parsed.errorArea;
  if (
    !errorArea
    || typeof errorArea !== "object"
    || typeof errorArea.label !== "string"
    || !["x", "y", "width", "height"].every((key) => (
      typeof errorArea[key as keyof typeof errorArea] === "number"
      && Number.isFinite(errorArea[key as keyof typeof errorArea])
    ))
  ) {
    throw new Error("Fahim returned no precise error area");
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
              "هذه الواجهة تحتاج JSON داخليًا، فلا تضف نصًا خارج الكائن المطلوب. أعد errorArea كصندوق نسبي دقيق يحيط بأول خطوة خاطئة في الصورة: x وy وwidth وheight أعداد من 0 إلى 1، مع label عربي.",
            ].join("\n\n"),
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `حلّل محاولة الطالب المصورة في درس "${lesson}" ومفهوم "${concept}". حدد أول خطوة خاطئة فقط، وآخر خطوة صحيحة قبلها، وحدد صندوقها النسبي بدقة، ثم اقترح تمرينًا واحدًا يعالج نفس الخطأ من العقد المرفقة. أعد JSON فقط بهذه المفاتيح: firstError, firstErrorStep, lastCorrectStep, feedback, nextExercise, summaryAnchor, errorArea (كائن يحوي x,y,width,height,label).\nعقد المعرفة المسترجعة من ChromaDB:\n${sourceText}`,
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

async function callVisionCopilotModel(
  imageDataUrl: string,
  question: string,
  lesson: string,
  concept: string,
  context: string,
  retrieval: RetrievalContext,
) {
  const sourceText = formatRetrievedContext(retrieval.documents);
  const response = await withTimeout(
    connectors.proxy("xai", "/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROK_VISION_MODEL ?? "grok-2-vision-1212",
        temperature: 0.1,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content: [
              FRIENDLY_TUTOR_PROMPT,
              GROUNDED_CONTENT_RULES,
              "أنت فهيم. اقرأ الجزء المحدد من السبورة وأجب عن سؤال الطالب بالعربية، بجمل قصيرة وخطوات واضحة. لا تخمّن أي شيء غير ظاهر، وإذا لم تكف الصورة فاذكر ذلك واقترح ما يجب تحديده.",
            ].join("\n\n"),
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `الدرس: ${lesson}\nالمفهوم: ${concept}\nسؤال الطالب: ${question}\nالسياق النصي: ${context || "لا يوجد"}\nعقد المعرفة المسترجعة:\n${sourceText}`,
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
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Vision provider returned no copilot answer");
  return content;
}

async function callTextModel(
  question: string,
  lesson: string,
  concept: string,
  context: string,
  topicContext: string,
  retrieval: RetrievalContext,
) {
  const sourceText = formatRetrievedContext(retrieval.documents);
  const response = await callDeepSeekTextModel(
    [
      {
        role: "system",
        content: [
          FRIENDLY_TUTOR_PROMPT,
          GROUNDED_CONTENT_RULES,
          "أنت فهيم، البومة الزرقاء المسؤولة عن أول عشرة أيام من تشخيص المكتسبات القبلية. اختبر مهارة واحدة في كل مرة بسؤال قصير قابل للإجابة، ولا تعطِ الحل كاملًا قبل كشف خطوة الطالب.",
          "أعد كائن JSON صالحًا فقط، دون Markdown أو نص خارجه، بهذه المفاتيح حرفيًا:",
          'speech_text (جملة عربية قصيرة صالحة للنطق)، chat_response (رد عربي ظاهر في المحادثة)، whiteboard_actions (مصفوفة من عناصر action وdetails؛ action واحد من draw_diagram أو type_text أو highlight_area؛ استخدم highlight_area عند وجود موضع واضح، وdetails يمكن أن تتضمن label وx وy وwidth وheight كنسب من 0 إلى 1)، evaluated_skill (اسم المهارة المقاسة)، mastery_score (عدد صحيح من 0 إلى 100).',
          "إذا لم يرسل الطالب محاولة قابلة للتقييم، قدّر mastery_score من 0 إلى 100 بحذر بناءً على إجابته الحالية، ولا تدّعِ دقة غير موجودة. اربط أي تفسير بالمصادر.",
        ].join("\n\n"),
      },
      {
        role: "user",
        content: [
          `الدرس: ${lesson}`,
          `المفهوم: ${concept}`,
          `الموضوع الذي يدرسه الطالب الآن: ${topicContext || "لا يوجد موضوع إبداعي محدد"}`,
          `سياق المحاولة والتحليل: ${context || "لا توجد محاولة محللة"}`,
          `سؤال الطالب: ${question}`,
          "",
          "عقد المعرفة المسترجعة من ChromaDB:",
          sourceText,
        ].join("\n"),
      },
    ],
    { temperature: 0.2, maxOutputTokens: 900 },
  );
  return extractFahimResponse(response, concept);
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
    res.json({
      ...analysis,
      fahim: {
        speech_text: analysis.feedback,
        chat_response: `موضع الخطأ: ${analysis.firstError}. ${analysis.feedback}`,
        whiteboard_actions: [{ action: "highlight_area", details: analysis.errorArea }],
        evaluated_skill: concept,
        mastery_score: 0,
      } satisfies FahimResponse,
      grounding: retrieval.grounding,
    });
  } catch (error) {
    req.log.error({ error }, "Fahim attempt analysis failed");
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "fahim_analysis_failed",
      message: "لا يمكن تحليل المحاولة قبل نجاح استرجاع عقد المعرفة من ChromaDB.",
    });
  }
});

router.post("/fahim/whiteboard-query", async (req, res): Promise<void> => {
  const { imageDataUrl, question, lesson, concept, context } = req.body as Record<string, unknown>;
  if (
    typeof imageDataUrl !== "string"
    || !imageDataUrl.startsWith("data:image/")
    || imageDataUrl.length > 7_000_000
    || typeof question !== "string"
    || !question.trim()
    || typeof lesson !== "string"
    || typeof concept !== "string"
    || (context !== undefined && typeof context !== "string")
  ) {
    res.status(400).json({ error: "invalid_whiteboard_query_payload" });
    return;
  }

  try {
    const retrieval = await retrieveGroundedKnowledge(`${lesson} ${concept} ${question}`, { nResults: 8 });
    const answer = await callVisionCopilotModel(
      imageDataUrl,
      question.trim(),
      lesson,
      concept,
      typeof context === "string" ? context : "",
      retrieval,
    );
    res.json({
      answer,
      fahim: {
        speech_text: answer,
        chat_response: answer,
        whiteboard_actions: [{ action: "highlight_area", details: { label: "الجزء المحدد" } }],
        evaluated_skill: concept,
        mastery_score: 0,
      } satisfies FahimResponse,
      grounding: retrieval.grounding,
    });
  } catch (error) {
    req.log.error({ error }, "Fahim whiteboard query failed");
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "fahim_whiteboard_query_failed",
      message: "لا يمكن أن يجيب فهيم عن السبورة قبل نجاح استرجاع المعرفة.",
    });
  }
});

router.post("/fahim/message", async (req, res): Promise<void> => {
  const { question, lesson, concept, context, topicContext } = req.body as Record<string, unknown>;
  if (
    typeof question !== "string" ||
    !question.trim() ||
    typeof lesson !== "string" ||
    typeof concept !== "string" ||
    (context !== undefined && typeof context !== "string") ||
    (topicContext !== undefined && typeof topicContext !== "string")
  ) {
    res.status(400).json({ error: "invalid_message_payload" });
    return;
  }

  try {
    const retrieval = await retrieveGroundedKnowledge(
      [lesson, concept, question, typeof topicContext === "string" ? topicContext : ""].filter(Boolean).join(" "),
      { nResults: 8 },
    );
    const fahim = await callTextModel(
      question,
      lesson,
      concept,
      typeof context === "string" ? context : "",
      typeof topicContext === "string" ? topicContext : "",
      retrieval,
    );
    res.json({ ...fahim, answer: fahim.chat_response, fahim, grounding: retrieval.grounding });
  } catch (error) {
    req.log.error({ error }, "Fahim message failed");
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "fahim_message_failed",
      message: "لا يمكن أن يجيب فهيم قبل نجاح استرجاع عقد المعرفة من ChromaDB.",
    });
  }
});

export default router;