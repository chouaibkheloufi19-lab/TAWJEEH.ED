import { Router, type IRouter } from "express";
import {
  AiEngineError,
  generateExplanation,
  generateExercises,
  normalizeExplanationRequest,
  normalizeExercisesRequest,
} from "../lib/ai-engine";
import { DeepSeekProviderError } from "../lib/ai-provider";

const router: IRouter = Router();

function errorResponse(error: unknown): {
  status: number;
  body: { error: string; message: string; retryable?: boolean };
} {
  if (error instanceof DeepSeekProviderError) {
    if (error.message.includes("DEEPSEEK_API_KEY")) {
      return {
        status: 503,
        body: {
          error: "ai_service_not_configured",
          message: "لم يتم إعداد مزود الذكاء الاصطناعي بعد.",
        },
      };
    }
    return {
      status: error.status === 429 ? 429 : 502,
      body: {
        error: "ai_provider_failed",
        message: "تعذر الاتصال بمزود الذكاء الاصطناعي. أعد المحاولة بعد قليل.",
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
      message: "أرسل lesson_title وcontent صالحين، وبحد أقصى 50000 حرف للمحتوى.",
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

export default router;