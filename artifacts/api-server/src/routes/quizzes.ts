import { Router, type IRouter } from "express";
import {
  ListQuizzesResponse,
  ListQuizAttemptsResponse,
  SubmitQuizAttemptBody,
  SubmitQuizAttemptParams,
  SubmitQuizAttemptResponse,
} from "@workspace/api-zod";
import {
  getExamMode,
  getUserId,
  listQuizAttempts,
  listSummaryBank,
  recordLearningAttempt,
  recordQuizAttempt,
} from "../lib/learning-store";
import { generateGroundedQuizQuestions, type GroundedQuizQuestion } from "../lib/quiz-generator";
import { KnowledgeGroundingError } from "../lib/rag";

const router: IRouter = Router();

type QuizMode = "standard" | "pre_exam" | "error_stack";

const quizzes = [
  {
    id: "weekly-physics",
    title: "الكويز الأسبوعي المخصص — الفيزياء",
    subject: "الفيزياء",
    description: "أسئلة تتبع مستواك وتركّز على المفاهيم التي تحتاج مراجعة بعد محاولاتك.",
    duration: "20 دقيقة",
    status: "متاح الآن",
    points: 120,
    is_high_difficulty: false,
    unit_id: "mechanics",
    score_threshold: 70,
    mode: "standard" as QuizMode,
    exercise_density: 1,
    reduce_passive_explanation: false,
    linked_concepts: ["recap", "graph", "practice"],
    questions: [
      { id: "q1", prompt: "ما العلاقة الصحيحة بين القوة والتسارع حسب القانون الثاني لنيوتن؟", options: ["F = m × a", "F = m ÷ a", "F = a ÷ m", "F = m + a"] },
      { id: "q2", prompt: "ماذا يحدث للسرعة عندما يكون التسارع موجبًا وثابتًا؟", options: ["تزداد بانتظام", "تنقص بانتظام", "تبقى ثابتة", "تنعدم"] },
      { id: "q3", prompt: "ما وحدة قياس الطاقة الحركية؟", options: ["الجول", "النيوتن", "الواط", "المتر"] },
    ],
  },
  {
    id: "mechanics-unit",
    title: "تحدّي نهاية الوحدة — الميكانيك",
    subject: "الفيزياء",
    description: "اختبار عام صعب يفتح بعد إتمام الوحدة لقياس الفهم الكامل.",
    duration: "12 دقيقة",
    status: "جاهز للبدء",
      points: 120,
    is_high_difficulty: true,
    unit_id: "mechanics",
    score_threshold: 80,
    mode: "standard" as QuizMode,
    exercise_density: 1,
    reduce_passive_explanation: false,
    linked_concepts: ["definition", "practice", "graph", "recap"],
    questions: [
        { id: "q1", prompt: "في الحركة المستقيمة المنتظمة يكون التسارع:", options: ["منعدمًا", "ثابتًا وموجبًا", "متغيرًا", "لا يمكن تحديده"] },
        { id: "q2", prompt: "القوة المحصلة تساوي:", options: ["مجموع القوى المؤثرة", "أكبر قوة فقط", "كتلة الجسم", "سرعة الجسم"] },
        { id: "q3", prompt: "حسب قانون نيوتن الثاني، إذا تضاعفت القوة وبقيت الكتلة ثابتة فإن التسارع:", options: ["يتضاعف", "ينخفض إلى النصف", "يبقى ثابتًا", "ينعدم"] },
        { id: "q4", prompt: "ميل منحنى الموضع بدلالة الزمن يمثل:", options: ["السرعة", "الكتلة", "القوة", "الطاقة"] },
        { id: "q5", prompt: "ما العلاقة الصحيحة لاستخراج التسارع من القوة والكتلة؟", options: ["a = F ÷ m", "a = F × m", "a = m ÷ F", "a = F + m"] },
    ],
  },
];

const preExamQuestionBank = [
  { id: "mock-1", prompt: "تتحرك عربة بتسارع ثابت. أي مجموعة من المعطيات تكفي لاستخراج القوة المحصلة؟", options: ["الكتلة والتسارع", "السرعة والزمن فقط", "الموضع والكتلة فقط", "الزمن والطاقة فقط"], concept_id: "practice", concept_title: "القوة المحصلة" },
  { id: "mock-2", prompt: "يمثل ميل منحنى الموضع بدلالة الزمن في لحظة معينة:", options: ["السرعة اللحظية", "التسارع المتوسط", "القوة المحصلة", "الطاقة الحركية"], concept_id: "graph", concept_title: "قراءة الميل" },
  { id: "mock-3", prompt: "إذا بقيت القوة ثابتة وتضاعفت كتلة الجسم، فإن تسارعه:", options: ["ينخفض إلى النصف", "يتضاعف", "يبقى ثابتًا", "ينعدم دائمًا"], concept_id: "recap", concept_title: "العلاقة بين القوة والكتلة والتسارع" },
  { id: "mock-4", prompt: "عند توقف الحافلة فجأة يميل الراكب إلى الأمام بسبب:", options: ["القصور الذاتي", "زيادة الكتلة", "انعدام القوة", "تغير الزمن"], concept_id: "definition", concept_title: "القصور الذاتي" },
  { id: "mock-5", prompt: "في حركة مستقيمة متسارعة بانتظام، يكون منحنى السرعة بدلالة الزمن:", options: ["مستقيمًا ذا ميل ثابت", "أفقيًا دائمًا", "منعدمًا", "دائريًا"], concept_id: "graph", concept_title: "تمثيل الحركة" },
  { id: "mock-6", prompt: "إذا كانت محصلة القوى المؤثرة في جسم منعدمة، فإن الجسم:", options: ["يبقى ساكنًا أو يتحرك بسرعة ثابتة", "يتسارع دائمًا", "تزداد كتلته", "يتوقف حتمًا"], concept_id: "definition", concept_title: "مبدأ العطالة" },
  { id: "mock-7", prompt: "جسم كتلته 2 كغ تؤثر فيه قوة محصلة قدرها 10 نيوتن. قيمة تسارعه هي:", options: ["5 م/ث²", "20 م/ث²", "8 م/ث²", "12 م/ث²"], concept_id: "practice", concept_title: "استخراج التسارع" },
  { id: "mock-8", prompt: "لتحديد طبيعة تغير الحركة من منحنى الموضع والزمن نراقب أساسًا:", options: ["تغير الميل", "لون المنحنى", "عدد المحاور", "وحدة الكتلة"], concept_id: "graph", concept_title: "تغير الميل" },
] as const;

function adaptiveQuiz(mode: QuizMode, examDate: string, errorConcepts: Array<{ concept_id: string; concept_title: string; last_error_tag: string }>) {
  if (mode === "error_stack") {
    const targeted = errorConcepts.slice(0, 6).map((concept, index) => ({
      id: `stack-${index + 1}`,
      prompt: `مكدس أخطاء · ${concept.concept_title}: أي خطوة تساعدك على تجنب الخطأ «${concept.last_error_tag}» قبل بدء الحل؟`,
      options: ["تحديد المعطيات والعلاقة المناسبة", "التعويض قبل قراءة المطلوب", "حذف الوحدة ثم التخمين", "اعتماد أول نتيجة دون تحقق"],
      concept_id: concept.concept_id,
      concept_title: concept.concept_title,
    }));
    return {
      id: "baccalaureate-error-stacks",
      title: "مكدسات الأخطاء — تدريب البكالوريا",
      subject: "الفيزياء",
      description: `تدريبات مركزة على ${targeted.length} مفاهيم تكررت فيها أخطاؤك، مع كثافة أعلى وشرح أقل.`,
      duration: "30 دقيقة",
      status: `مفعّل · بقي ${Math.max(0, daysUntilExam(examDate))} يومًا`,
      points: targeted.length * 30,
      is_high_difficulty: true,
      unit_id: "mechanics",
      score_threshold: 80,
      mode,
      exercise_density: 3,
      reduce_passive_explanation: true,
      linked_concepts: targeted.map((question) => question.concept_id),
      questions: targeted,
    };
  }
  const questions = preExamQuestionBank.slice(0, 6);
  return {
    id: "baccalaureate-mock-exam",
    title: "ورقة محاكاة البكالوريا — متنوعة وصعبة",
    subject: "الفيزياء",
    description: "ورقة امتحان تجريبية تُبنى تلقائيًا من أسئلة متنوعة تغطي الفهم، الرسم، والتحليل الحسابي.",
    duration: "45 دقيقة",
    status: `مفعّل · بقي ${Math.max(0, daysUntilExam(examDate))} يومًا`,
    points: 180,
    is_high_difficulty: true,
    unit_id: "mechanics",
    score_threshold: 70,
    mode,
    exercise_density: 2,
    reduce_passive_explanation: false,
    linked_concepts: [...new Set(questions.map((question) => question.concept_id))],
    questions,
  };
}

function daysUntilExam(examDate: string) {
  const target = new Date(`${examDate}T00:00:00Z`);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

type GroundedQuiz = {
  id: string;
  title: string;
  subject: string;
  description: string;
  duration: string;
  status: string;
  points: number;
  is_high_difficulty: boolean;
  unit_id: string;
  score_threshold: number;
  mode: QuizMode;
  exercise_density: number;
  reduce_passive_explanation: boolean;
  linked_concepts: string[];
  questions: GroundedQuizQuestion[];
};

const groundedQuizCache = new Map<string, Promise<GroundedQuiz[]>>();

async function buildGroundedQuizzes(
  userId: string,
  requestedExamDate?: string,
): Promise<GroundedQuiz[]> {
  const mode = await getExamMode(userId, requestedExamDate);
  const errorContext = mode.error_concepts
    .map((concept) => `${concept.concept_title}: ${concept.last_error_tag}`)
    .join(" | ");
  const cacheKey = [userId, mode.mode, mode.exam_date, errorContext].join("::");
  const cached = groundedQuizCache.get(cacheKey);
  if (cached) return cached;
  const generation = generateGroundedQuizQuestions({
    lesson: "قوانين نيوتن والحركة",
    mode: mode.mode,
    level: "3AS",
    errorContext,
  }).then(({ questions }) => {
    const weeklyQuestions = questions.slice(0, 3);
    const unitQuestions = questions.slice(0, 6);
    const common = {
      subject: "الفيزياء",
      unit_id: "mechanics",
      exercise_density: mode.exercise_density,
      reduce_passive_explanation: mode.reduce_passive_explanation,
    };
    const result: GroundedQuiz[] = [
      {
        ...common,
        id: "weekly-physics",
        title: "الكويز الأسبوعي المخصص — مؤسس على المعرفة",
        description: "أسئلة مستخرجة من عقد المنهاج وسجل أخطائك الحالي.",
        duration: "20 دقيقة",
        status: "متاح الآن",
        points: 120,
        is_high_difficulty: false,
        score_threshold: 70,
        mode: "standard",
        linked_concepts: [...new Set(weeklyQuestions.map((question) => question.conceptId))],
        questions: weeklyQuestions,
      },
      {
        ...common,
        id: "mechanics-unit",
        title: "تحدّي نهاية الوحدة — مؤسس على المعرفة",
        description: "تقييم وحدة مبني على أسئلة مرتبطة بعقد ChromaDB المسترجعة.",
        duration: "25 دقيقة",
        status: "يفتح بعد إتمام الوحدة",
        points: 180,
        is_high_difficulty: true,
        score_threshold: 80,
        mode: "standard",
        linked_concepts: [...new Set(unitQuestions.map((question) => question.conceptId))],
        questions: unitQuestions,
      },
    ];
    if (mode.mode !== "standard") {
      result.push({
        ...common,
        id: mode.mode === "error_stack" ? "baccalaureate-error-stacks" : "baccalaureate-mock-exam",
        title: mode.mode === "error_stack" ? "مكدسات الأخطاء — مؤسس على المعرفة" : "محاكاة البكالوريا — مؤسس على المعرفة",
        description: mode.mode === "error_stack"
          ? "تدريبات مركزة على المفاهيم ذات معدل الخطأ الأعلى."
          : "ورقة متنوعة مستخرجة من المصادر المناسبة للمستوى.",
        duration: mode.mode === "error_stack" ? "30 دقيقة" : "45 دقيقة",
        status: `مفعّل · بقي ${Math.max(0, mode.days_until)} يومًا`,
        points: mode.mode === "error_stack" ? unitQuestions.length * 30 : 180,
        is_high_difficulty: true,
        score_threshold: 80,
        mode: mode.mode,
        linked_concepts: [...new Set(unitQuestions.map((question) => question.conceptId))],
        questions: unitQuestions,
      });
    }
    return result;
  }).catch((error) => {
    groundedQuizCache.delete(cacheKey);
    throw error;
  });
  groundedQuizCache.set(cacheKey, generation);
  return generation;
}

async function getAvailableQuizzes(userId: string | null, requestedExamDate?: string) {
  if (!userId) return [];
  return buildGroundedQuizzes(userId, requestedExamDate);
}

async function hasCompletedMechanicsUnit(userId: string | null) {
  if (!userId) return false;
  const data = await listSummaryBank(userId);
  const summary = data.summaries.find((item) => item.lesson_id === "newton-motion");
  return Boolean(summary && summary.concepts.length > 0 && summary.concepts.every((concept) => (concept.mastery ?? 0) >= 100));
}

router.get("/quizzes", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    const unitComplete = await hasCompletedMechanicsUnit(userId);
    const requestedExamDate = typeof req.query.exam_date === "string" ? req.query.exam_date : undefined;
    const availableQuizzes = await getAvailableQuizzes(userId, requestedExamDate);
    res.json(ListQuizzesResponse.parse(availableQuizzes.map((quiz) => (
      quiz.is_high_difficulty && quiz.mode === "standard"
        ? { ...quiz, status: unitComplete ? "مفتوح الآن — تقييم عالي الصعوبة" : "يفتح بعد إتمام الوحدة" }
        : quiz
    ))));
  } catch (error) {
    req.log.error({ error }, "Grounded quiz generation failed");
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "grounded_quiz_generation_failed",
      message: "لا يمكن تجهيز الاختبار قبل نجاح استرجاع عقد المعرفة من ChromaDB.",
    });
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
  let availableQuizzes: GroundedQuiz[];
  try {
    availableQuizzes = await getAvailableQuizzes(userId, body.data.exam_date) as GroundedQuiz[];
  } catch (error) {
    req.log.error({ error }, "Grounded quiz retrieval failed during submission");
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "grounded_quiz_unavailable",
      message: "لا يمكن تصحيح الاختبار قبل التحقق من مصادر ChromaDB.",
    });
    return;
  }
  const quiz = availableQuizzes.find((item) => item.id === params.data.quizId);
  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }
  if (quiz.is_high_difficulty && quiz.mode === "standard" && !(await hasCompletedMechanicsUnit(userId))) {
    res.status(403).json({ error: "Complete the mechanics unit before starting the high-difficulty assessment" });
    return;
  }
  const correctAnswers: Record<string, string> = Object.fromEntries(
    quiz.questions.map((question) => [question.id, question.correctOption]),
  );
  const correct = quiz.questions.reduce(
    (total, question) => total + (body.data.answers[question.id] === correctAnswers[question.id] ? 1 : 0),
    0,
  );
  const score = Math.round((correct / quiz.questions.length) * 100);
  const passed = score >= quiz.score_threshold;
  const attempt = await recordQuizAttempt(userId, {
    quizId: quiz.id,
    quizTitle: quiz.title,
    score,
    correct,
    total: quiz.questions.length,
    pointsEarned: Math.round((correct / quiz.questions.length) * quiz.points),
    isHighDifficulty: quiz.is_high_difficulty,
    passed,
  });
  for (const question of quiz.questions) {
    const questionContext = question as typeof question & { concept_id?: string; concept_title?: string };
    await recordLearningAttempt(userId, {
      lessonId: "newton-motion",
      lessonTitle: "قوانين نيوتن والحركة",
      conceptId: questionContext.concept_id ?? quiz.linked_concepts[0] ?? "mechanics",
      conceptTitle: questionContext.concept_title ?? "تطبيق الميكانيك",
      errorTag: body.data.answers[question.id] === correctAnswers[question.id] ? "correct" : `خطأ في ${quiz.title}`,
      isCorrect: body.data.answers[question.id] === correctAnswers[question.id],
    });
  }
  const data = SubmitQuizAttemptResponse.parse({
    quiz_id: quiz.id,
    score,
    correct,
    total: quiz.questions.length,
    message: passed ? "أداء رائع! واصل بهذه الوتيرة." : "بداية جيدة. راجع الملخصات ثم حاول مرة أخرى.",
    points_earned: Math.round((correct / quiz.questions.length) * quiz.points),
    attempt_id: attempt.id,
    passed,
    is_high_difficulty: quiz.is_high_difficulty,
    mode: quiz.mode,
    linked_concepts: quiz.linked_concepts,
  });
  res.json(data);
});

export default router;