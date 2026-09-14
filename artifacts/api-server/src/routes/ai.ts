import { Router, type IRouter } from "express";
import {
  AiEngineError,
  generateExplanation,
  generateExercises,
  generateDaleelResponse,
  normalizeExplanationRequest,
  normalizeExercisesRequest,
  normalizeDaleelRequest,
} from "../lib/ai-engine";
import { DeepSeekProviderError } from "../lib/ai-provider";
import { KnowledgeGroundingError } from "../lib/rag";

const router: IRouter = Router();

function errorResponse(error: unknown): {
  status: number;
  body: { error: string; message: string; retryable?: boolean };
} {
  if (error instanceof DeepSeekProviderError) {
    if (error.message.includes("XAI_CONNECTION_NOT_CONFIGURED")) {
      return {
        status: 503,
        body: {
          error: "ai_connection_not_configured",
          message:
            "تعذر تشغيل المساعدة الذكية لأن اتصال مزود الذكاء الاصطناعي غير مهيأ. يمكنك متابعة الدرس من المصادر المتاحة، ثم إعادة المحاولة بعد تهيئة الاتصال.",
        },
      };
    }
    if (error.message.includes("DEEPSEEK_CONNECTION_NOT_CONFIGURED")) {
      return {
        status: 503,
        body: {
          error: "ai_connection_not_configured",
          message:
            "رفضت خدمة DeepSeek المفتاح الحالي أو لم تقبله. تحقق من DEEPSEEK_API_KEY في Secrets ثم أعد المحاولة، ويمكنك متابعة الدرس من المصادر المتاحة الآن.",
        },
      };
    }
    return {
      status: error.status === 429 ? 429 : 502,
      body: {
        error: "ai_provider_failed",
        message:
          error.status === 429
            ? "توقفت المساعدة الذكية مؤقتًا بسبب كثرة الطلبات. تابع الدرس من المصادر المتاحة وأعد المحاولة بعد قليل."
            : "تعذر إكمال المساعدة الذكية الآن. يمكنك متابعة الدرس من المصادر المتاحة، ثم إعادة المحاولة بعد قليل.",
        ...(error.retryable ? { retryable: true } : {}),
      },
    };
  }
  if (error instanceof AiEngineError) {
    return {
      status: 502,
      body: {
        error: error.code,
        message: "أعاد النموذج نتيجة غير مكتملة. أعد المحاولة بعد قليل.",
        retryable: true,
      },
    };
  }
  if (error instanceof KnowledgeGroundingError) {
    return {
      status: 424,
      body: {
        error: error.code,
        message:
          "لا يمكن توليد المحتوى قبل العثور على مقاطع مصدرية في قاعدة ChromaDB.",
      },
    };
  }
  return {
    status: 502,
    body: {
      error: "ai_generation_failed",
      message: "تعذر توليد المحتوى التعليمي حاليًا. أعد المحاولة بعد قليل.",
      retryable: true,
    },
  };
}

router.post("/ai/generate-explanation", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const request = normalizeExplanationRequest(body);
  if (!request) {
    res.status(400).json({
      error: "invalid_explanation_payload",
      message:
        "أرسل lesson_title وcontent صالحين، وبحد أقصى 50000 حرف للمحتوى.",
    });
    return;
  }

  try {
    res.json(await generateExplanation(request));
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Explanation generation failed",
    );
    const response = errorResponse(error);
    res.status(response.status).json(response.body);
  }
});

router.post("/ai/generate-exercises", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const request = normalizeExercisesRequest(body);
  if (!request) {
    res.status(400).json({
      error: "invalid_exercises_payload",
      message:
        "أرسل lesson_title وcontent، ويمكن تحديد exercise_count بين 1 و10 وexercise_types من mcq أو true_false أو practical.",
    });
    return;
  }

  try {
    res.json(await generateExercises(request));
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Exercises generation failed",
    );
    const response = errorResponse(error);
    res.status(response.status).json(response.body);
  }
});

router.post("/ai/daleel", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const request = normalizeDaleelRequest(body);
  if (!request) {
    res.status(400).json({
      error: "invalid_daleel_payload",
      message:
        "أرسل lesson_title وcontent وquestion صالحين، مع إحداثيات نسبية صحيحة عند تحديد منطقة.",
    });
    return;
  }
  try {
    res.json(await generateDaleelResponse(request));
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Daleel tutor generation failed",
    );
    const response = errorResponse(error);
    res.status(response.status).json(response.body);
  }
});

export default router;
