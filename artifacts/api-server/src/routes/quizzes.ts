import { Router, type IRouter } from "express";
import {
  ListQuizzesResponse,
  ListQuizAttemptsResponse,
  SubmitQuizAttemptBody,
  SubmitQuizAttemptParams,
  SubmitQuizAttemptResponse,
} from "@workspace/api-zod";
import {
  getUserId,
  listQuizAttempts,
  listSummaryBank,
  recordQuizAttempt,
} from "../lib/learning-store";

const router: IRouter = Router();

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
    questions: [
        { id: "q1", prompt: "في الحركة المستقيمة المنتظمة يكون التسارع:", options: ["منعدمًا", "ثابتًا وموجبًا", "متغيرًا", "لا يمكن تحديده"] },
        { id: "q2", prompt: "القوة المحصلة تساوي:", options: ["مجموع القوى المؤثرة", "أكبر قوة فقط", "كتلة الجسم", "سرعة الجسم"] },
        { id: "q3", prompt: "حسب قانون نيوتن الثاني، إذا تضاعفت القوة وبقيت الكتلة ثابتة فإن التسارع:", options: ["يتضاعف", "ينخفض إلى النصف", "يبقى ثابتًا", "ينعدم"] },
        { id: "q4", prompt: "ميل منحنى الموضع بدلالة الزمن يمثل:", options: ["السرعة", "الكتلة", "القوة", "الطاقة"] },
        { id: "q5", prompt: "ما العلاقة الصحيحة لاستخراج التسارع من القوة والكتلة؟", options: ["a = F ÷ m", "a = F × m", "a = m ÷ F", "a = F + m"] },
    ],
  },
];

async function hasCompletedMechanicsUnit(userId: string | null) {
  if (!userId) return false;
  const data = await listSummaryBank(userId);
  const summary = data.summaries.find((item) => item.lesson_id === "newton-motion");
  return Boolean(summary && summary.concepts.length > 0 && summary.concepts.every((concept) => (concept.mastery ?? 0) >= 100));
}

router.get("/quizzes", async (req, res): Promise<void> => {
  const unitComplete = await hasCompletedMechanicsUnit(getUserId(req));
  res.json(ListQuizzesResponse.parse(quizzes.map((quiz) => (
    quiz.is_high_difficulty
      ? { ...quiz, status: unitComplete ? "مفتوح الآن — تقييم عالي الصعوبة" : "يفتح بعد إتمام الوحدة" }
      : quiz
  ))));
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
  const quiz = quizzes.find((item) => item.id === params.data.quizId);
  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }
  if (quiz.is_high_difficulty && !(await hasCompletedMechanicsUnit(userId))) {
    res.status(403).json({ error: "Complete the mechanics unit before starting the high-difficulty assessment" });
    return;
  }
  const correctAnswers: Record<string, string> =
    quiz.id === "weekly-physics"
      ? { q1: "F = m × a", q2: "تزداد بانتظام", q3: "الجول" }
      : {
          q1: "منعدمًا",
          q2: "مجموع القوى المؤثرة",
          q3: "يتضاعف",
          q4: "السرعة",
          q5: "a = F ÷ m",
        };
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
  });
  res.json(data);
});

export default router;