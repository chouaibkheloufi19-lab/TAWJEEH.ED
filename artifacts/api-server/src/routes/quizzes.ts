import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  ListQuizzesResponse,
  ListQuizAttemptsResponse,
  SubmitQuizAttemptBody,
  SubmitQuizAttemptParams,
  SubmitQuizAttemptResponse,
} from "@workspace/api-zod";
import type {
  QuizSession,
  QuizType,
  StoredQuizQuestion,
} from "@workspace/db";
import {
  getUserId,
  listQuizAttempts,
  listSummaryBank,
  recordLearningAttempt,
  recordQuizAttempt,
} from "../lib/learning-store";
import {
  findQuizSessionByCacheKey,
  findQuizSessionById,
  getQuizWeek,
  insertQuizSession,
} from "../lib/quiz-session-store";
import { generateGroundedQuizQuestions } from "../lib/quiz-generator";
import { KnowledgeGroundingError } from "../lib/rag";

const router: IRouter = Router();
const sharedQuizLocks = new Map<string, Promise<QuizSession>>();

const UNIT_DETAILS: Record<string, { title: string; subject: string }> = {
  mechanics: { title: "الميكانيك", subject: "الفيزياء" },
};

function publicUnitDetails(unitId: string) {
  return UNIT_DETAILS[unitId] ?? { title: unitId, subject: "التعليم الثانوي" };
}

function publicQuiz(session: QuizSession, status = "متاح الآن") {
  return {
    id: session.quizId,
    title: session.title,
    subject: session.subject,
    description: session.description,
    duration: session.duration,
    status,
    points: session.points,
    is_high_difficulty: session.isHighDifficulty,
    unit_id: session.unitId ?? "global",
    score_threshold: session.scoreThreshold,
    mode: session.mode,
    exercise_density: session.exerciseDensity,
    reduce_passive_explanation: session.reducePassiveExplanation,
    linked_concepts: session.linkedConcepts,
    quiz_type: session.quizType,
    lesson_ids: session.lessonIds,
    week_year: session.weekYear,
    week_number: session.weekNumber,
    week_start: session.weekStart,
    created_at: session.createdAt.toISOString(),
    questions: session.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options,
      concept_id: question.conceptId,
      concept_title: question.conceptTitle,
      source_node_ids: question.sourceNodeIds,
    })),
  };
}

function generationError(error: unknown) {
  return {
    status: error instanceof KnowledgeGroundingError ? 424 : 502,
    body: {
      error: error instanceof KnowledgeGroundingError
        ? error.code
        : "quiz_generation_failed",
      message: error instanceof KnowledgeGroundingError
        ? "لا يمكن تجهيز الكويز قبل نجاح استرجاع عقد المعرفة من ChromaDB."
        : "تعذر توليد الكويز حاليًا. أعد المحاولة بعد قليل.",
    },
  };
}

async function createSharedWeeklyQuiz(input: {
  quizType: Exclude<QuizType, "CUSTOM_PRIVATE">;
  unitId?: string;
  lessonIds: string[];
  lesson: string;
  title: string;
  description: string;
  questionCount: number;
}): Promise<QuizSession> {
  const week = getQuizWeek();
  const cacheKey = `${input.quizType}:${input.unitId ?? "global"}:${week.key}`;
  const existing = await findQuizSessionByCacheKey(cacheKey);
  if (existing) return existing;

  const inFlight = sharedQuizLocks.get(cacheKey);
  if (inFlight) return inFlight;

  const generation = (async () => {
    const afterLock = await findQuizSessionByCacheKey(cacheKey);
    if (afterLock) return afterLock;

    const generated = await generateGroundedQuizQuestions({
      lesson: input.lesson,
      mode: input.quizType,
      level: "3AS",
      errorContext: "كويز موحد وثابت لجميع الطلاب خلال الأسبوع الحالي",
      questionCount: input.questionCount,
    });
    const details = publicUnitDetails(input.unitId ?? "global");
    return insertQuizSession({
      quizId: `${input.quizType.toLowerCase()}:${input.unitId ?? "global"}:${week.key}`,
      cacheKey,
      quizType: input.quizType,
      ownerUserId: null,
      title: input.title,
      subject: details.subject,
      description: input.description,
      duration: input.quizType === "WEEKLY_GLOBAL" ? "20 دقيقة" : "25 دقيقة",
      points: input.questionCount * 30,
      isHighDifficulty: input.quizType === "UNIT_WEEKLY",
      unitId: input.unitId ?? null,
      lessonIds: input.lessonIds,
      scoreThreshold: input.quizType === "UNIT_WEEKLY" ? 80 : 70,
      mode: "standard",
      exerciseDensity: 1,
      reducePassiveExplanation: false,
      linkedConcepts: [...new Set(generated.questions.map((question) => question.conceptId))],
      questions: generated.questions,
      groundingNodeIds: generated.retrieval.grounding.retrievedNodeIds,
      weekYear: week.year,
      weekNumber: week.number,
      weekStart: week.start,
    });
  })().finally(() => {
    sharedQuizLocks.delete(cacheKey);
  });
  sharedQuizLocks.set(cacheKey, generation);
  return generation;
}

async function getGlobalWeeklyQuiz() {
  return createSharedWeeklyQuiz({
    quizType: "WEEKLY_GLOBAL",
    lessonIds: ["all-current-lessons"],
    lesson: "مراجعة أسبوعية شاملة في قوانين نيوتن والحركة",
    title: "الكويز الأسبوعي الموحد",
    description: "كويز ثابت ومشترك بين جميع الطلاب طوال الأسبوع الحالي.",
    questionCount: 6,
  });
}

async function getUnitWeeklyQuiz(unitId: string) {
  const details = publicUnitDetails(unitId);
  return createSharedWeeklyQuiz({
    quizType: "UNIT_WEEKLY",
    unitId,
    lessonIds: [unitId],
    lesson: `دروس وحدة ${details.title}`,
    title: `الكويز الأسبوعي لوحدة ${details.title}`,
    description: "كويز وحدة ثابت يغطي دروس الوحدة الحالية طوال الأسبوع.",
    questionCount: 6,
  });
}

function readCustomQuizRequest(body: Record<string, unknown>) {
  const unitValue = body.unit_id ?? body.unitId;
  const unitId = typeof unitValue === "string" ? unitValue.trim() : "";
  const lessonValue = body.lesson_ids ?? body.lessonIds;
  const lessonIds = Array.isArray(lessonValue)
    ? lessonValue
        .filter((lesson): lesson is string => typeof lesson === "string")
        .map((lesson) => lesson.trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];
  const countValue = body.question_count ?? body.questions_count ?? body.questionCount ?? 6;
  const count = Number(countValue);
  const questionCount = Number.isInteger(count) ? Math.max(3, Math.min(count, 12)) : 0;
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim().slice(0, 160)
    : "كويز خاص مخصص";
  const level = typeof body.level === "string" ? body.level.trim().slice(0, 80) : "3AS";

  if ((!unitId && !lessonIds.length) || !questionCount) return null;
  return { unitId: unitId || null, lessonIds, questionCount, title, level };
}

router.get("/quizzes/weekly", async (req, res): Promise<void> => {
  try {
    const session = await getGlobalWeeklyQuiz();
    res.json(publicQuiz(session));
  } catch (error) {
    req.log.error({ error }, "Global weekly quiz generation failed");
    const response = generationError(error);
    res.status(response.status).json(response.body);
  }
});

router.get("/quizzes/unit/:unitId/weekly", async (req, res): Promise<void> => {
  const unitId = req.params.unitId?.trim();
  if (!unitId || !/^[a-zA-Z0-9_-]{2,80}$/.test(unitId)) {
    res.status(400).json({ error: "invalid_unit_id", message: "معرّف الوحدة غير صالح." });
    return;
  }
  try {
    const session = await getUnitWeeklyQuiz(unitId);
    res.json(publicQuiz(session, "متاح طوال الأسبوع الحالي"));
  } catch (error) {
    req.log.error({ error, unitId }, "Unit weekly quiz generation failed");
    const response = generationError(error);
    res.status(response.status).json(response.body);
  }
});

router.post("/quizzes/custom", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const input = readCustomQuizRequest((req.body ?? {}) as Record<string, unknown>);
  if (!input) {
    res.status(400).json({
      error: "invalid_custom_quiz_payload",
      message: "حدد unit_id أو lesson_ids، وعدد الأسئلة بين 3 و12.",
    });
    return;
  }

  try {
    const lesson = [input.unitId, ...input.lessonIds].filter(Boolean).join(" ");
    const generated = await generateGroundedQuizQuestions({
      lesson: lesson || "المحتوى التعليمي المحدد",
      mode: "CUSTOM_PRIVATE",
      level: input.level,
      errorContext: `كويز خاص للدروس: ${input.lessonIds.join("، ") || input.unitId}`,
      questionCount: input.questionCount,
    });
    const details = publicUnitDetails(input.unitId ?? "custom");
    const session = await insertQuizSession({
      quizId: `custom-private:${randomUUID()}`,
      cacheKey: `CUSTOM_PRIVATE:${userId}:${randomUUID()}`,
      quizType: "CUSTOM_PRIVATE",
      ownerUserId: userId,
      title: input.title,
      subject: details.subject,
      description: "كويز خاص مولد حسب الوحدة والدروس التي حددها الطالب.",
      duration: "20 دقيقة",
      points: input.questionCount * 30,
      isHighDifficulty: false,
      unitId: input.unitId,
      lessonIds: input.lessonIds,
      scoreThreshold: 70,
      mode: "standard",
      exerciseDensity: 1,
      reducePassiveExplanation: false,
      linkedConcepts: [...new Set(generated.questions.map((question) => question.conceptId))],
      questions: generated.questions,
      groundingNodeIds: generated.retrieval.grounding.retrievedNodeIds,
      weekYear: null,
      weekNumber: null,
      weekStart: null,
    });
    res.status(201).json(publicQuiz(session, "خاص بك — جاهز للبدء"));
  } catch (error) {
    req.log.error({ error }, "Custom quiz generation failed");
    const response = generationError(error);
    res.status(response.status).json(response.body);
  }
});

router.get("/quizzes", async (req, res): Promise<void> => {
  try {
    const globalQuiz = await getGlobalWeeklyQuiz();
    const unitQuiz = await getUnitWeeklyQuiz("mechanics");
    const userId = getUserId(req);
    const summaries = userId ? await listSummaryBank(userId) : null;
    const unitComplete = Boolean(
      summaries?.summaries
        .find((item) => item.lesson_id === "newton-motion")
        ?.concepts.every((concept) => (concept.mastery ?? 0) >= 100),
    );
    const quizzes = [
      publicQuiz(globalQuiz),
      publicQuiz(
        unitQuiz,
        unitComplete ? "مفتوح الآن — تقييم الوحدة" : "يفتح بعد إتمام الوحدة",
      ),
    ];
    res.json(ListQuizzesResponse.parse(quizzes));
  } catch (error) {
    req.log.error({ error }, "Quiz list generation failed");
    const response = generationError(error);
    res.status(response.status).json(response.body);
  }
});

router.get("/quizzes/attempts", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(ListQuizAttemptsResponse.parse(await listQuizAttempts(userId)));
});

router.post("/quizzes/:quizId/attempt", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = SubmitQuizAttemptParams.safeParse(req.params);
  const body = SubmitQuizAttemptBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const quiz = await findQuizSessionById(params.data.quizId, userId);
  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }
  if (quiz.quizType === "UNIT_WEEKLY" && !(
    (await listSummaryBank(userId)).summaries
      .find((item) => item.lesson_id === "newton-motion")
      ?.concepts.every((concept) => (concept.mastery ?? 0) >= 100)
  )) {
    res.status(403).json({ error: "Complete the unit before starting the unit assessment" });
    return;
  }

  const correct = quiz.questions.reduce(
    (total, question) => total + (
      body.data.answers[question.id] === question.correctOption ? 1 : 0
    ),
    0,
  );
  const score = Math.round((correct / quiz.questions.length) * 100);
  const passed = score >= quiz.scoreThreshold;
  const attempt = await recordQuizAttempt(userId, {
    quizSessionId: quiz.id,
    quizId: quiz.quizId,
    quizTitle: quiz.title,
    score,
    correct,
    total: quiz.questions.length,
    pointsEarned: Math.round((correct / quiz.questions.length) * quiz.points),
    isHighDifficulty: quiz.isHighDifficulty,
    passed,
  });
  for (const question of quiz.questions) {
    const isCorrect = body.data.answers[question.id] === question.correctOption;
    await recordLearningAttempt(userId, {
      lessonId: quiz.unitId ?? "quiz",
      lessonTitle: quiz.title,
      conceptId: question.conceptId,
      conceptTitle: question.conceptTitle,
      errorTag: isCorrect ? "correct" : `خطأ في ${quiz.title}`,
      isCorrect,
    });
  }

  const mode = quiz.mode === "pre_exam" || quiz.mode === "error_stack"
    ? quiz.mode
    : "standard";
  res.json(SubmitQuizAttemptResponse.parse({
    quiz_id: quiz.quizId,
    score,
    correct,
    total: quiz.questions.length,
    message: passed ? "أداء رائع! واصل بهذه الوتيرة." : "بداية جيدة. راجع الملخصات ثم حاول مرة أخرى.",
    points_earned: Math.round((correct / quiz.questions.length) * quiz.points),
    attempt_id: attempt.id,
    passed,
    is_high_difficulty: quiz.isHighDifficulty,
    mode,
    linked_concepts: quiz.linkedConcepts,
  }));
});

export default router;