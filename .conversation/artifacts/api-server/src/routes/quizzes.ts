import { Router, type IRouter } from "express";
import {
  ListQuizzesResponse,
  SubmitQuizAttemptBody,
  SubmitQuizAttemptParams,
  SubmitQuizAttemptResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const quizzes = [
  {
    id: "weekly-physics",
    title: "مراجعة الفيزياء الأسبوعية",
    subject: "الفيزياء",
    description: "اختبر فهمك لما راجعته هذا الأسبوع",
    duration: "20 دقيقة",
    status: "متاح الآن",
    points: 120,
    questions: [
      { id: "q1", prompt: "ما العلاقة الصحيحة بين القوة والتسارع حسب القانون الثاني لنيوتن؟", options: ["F = m × a", "F = m ÷ a", "F = a ÷ m", "F = m + a"] },
      { id: "q2", prompt: "ماذا يحدث للسرعة عندما يكون التسارع موجبًا وثابتًا؟", options: ["تزداد بانتظام", "تنقص بانتظام", "تبقى ثابتة", "تنعدم"] },
      { id: "q3", prompt: "ما وحدة قياس الطاقة الحركية؟", options: ["الجول", "النيوتن", "الواط", "المتر"] },
    ],
  },
  {
    id: "mechanics-unit",
    title: "كويز وحدة الميكانيك",
    subject: "الفيزياء",
    description: "تقييم قصير بعد إتمام الوحدة",
    duration: "12 دقيقة",
    status: "جاهز للبدء",
    points: 80,
    questions: [
      { id: "q1", prompt: "في الحركة المستقيمة المنتظمة يكون التسارع:", options: ["منعدمًا", "ثابتًا وموجبًا", "متغيرًا", "لا يمكن تحديده"] },
      { id: "q2", prompt: "القوة المحصلة تساوي:", options: ["مجموع القوى المؤثرة", "أكبر قوة فقط", "كتلة الجسم", "سرعة الجسم"] },
    ],
  },
];

router.get("/quizzes", (_req, res): void => {
  res.json(ListQuizzesResponse.parse(quizzes));
});

router.post("/quizzes/:quizId/attempt", (req, res): void => {
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
  const correctAnswers: Record<string, string> =
    quiz.id === "weekly-physics"
      ? { q1: "F = m × a", q2: "تزداد بانتظام", q3: "الجول" }
      : { q1: "منعدمًا", q2: "مجموع القوى المؤثرة" };
  const correct = quiz.questions.reduce(
    (total, question) => total + (body.data.answers[question.id] === correctAnswers[question.id] ? 1 : 0),
    0,
  );
  const score = Math.round((correct / quiz.questions.length) * 100);
  const data = SubmitQuizAttemptResponse.parse({
    quiz_id: quiz.id,
    score,
    correct,
    total: quiz.questions.length,
    message: score >= 70 ? "أداء رائع! واصل بهذه الوتيرة." : "بداية جيدة. راجع الملخصات ثم حاول مرة أخرى.",
    points_earned: Math.round((correct / quiz.questions.length) * quiz.points),
  });
  res.json(data);
});

export default router;