import { Router, type IRouter } from "express";
import {
  CompleteLessonBody,
  CompleteLessonParams,
  CompleteLessonResponse,
  GetDashboardResponse,
  GetLearningScheduleResponse,
  GetSummaryBankResponse,
  RecordLearningAttemptBody,
  RecordLearningAttemptResponse,
  UpdateLearningScheduleBody,
  UpdateLearningScheduleParams,
  UpdateLearningScheduleResponse,
} from "@workspace/api-zod";
import {
  getUserId,
  listErrorBank,
  listLearningSchedule,
  listSummaryBank,
  recordLearningAttempt,
  saveLessonSummary,
  updateLearningSchedule,
} from "../lib/learning-store";

const router: IRouter = Router();

router.get("/dashboard", (req, res): void => {
  req.log.info("Fetching student dashboard");
  const data = GetDashboardResponse.parse({
    profile: {
      name: "ياسين",
      grade: "السنة الثالثة ثانوي",
      streak: 7,
      avatar: "ي",
    },
    metrics: [
       { label: "المراجعات المكتملة", value: "6", detail: "هذا الأسبوع", tone: "teal" },
       { label: "المحاولات المحفوظة", value: "4", detail: "في بنك الأخطاء", tone: "blue" },
       { label: "الكويزات المنجزة", value: "2", detail: "هذا الأسبوع", tone: "amber" },
    ],
    today: [
       { id: "study-1", time: "08:30", title: "الدوال", subject: "الرياضيات", duration: "45 دقيقة", kind: "درس من المكتبة", completed: true },
       { id: "study-2", time: "10:00", title: "التحولات الكيميائية", subject: "الفيزياء", duration: "35 دقيقة", kind: "تمارين", completed: false },
       { id: "study-3", time: "17:30", title: "مراجعة عامة", subject: "الرياضيات", duration: "20 دقيقة", kind: "تقييم", completed: false },
    ],
    activities: [
      { id: "activity-1", title: "أكملت درس الحركة المستقيمة", description: "أضاف دليل ملخصًا جديدًا إلى بنك المعرفة", time: "منذ ساعتين", icon: "book" },
      { id: "activity-2", title: "سلسلة 7 أيام", description: "رائع! حافظت على حضورك اليومي", time: "أمس", icon: "flame" },
      { id: "activity-3", title: "فهمت مفهوم التسارع", description: "تحسن الإتقان من 42% إلى 65%", time: "أمس", icon: "spark" },
    ],
    mastery: [
      { subject: "الفيزياء", percent: 72, color: "teal", note: "تقدم ممتاز" },
      { subject: "الرياضيات", percent: 58, color: "blue", note: "يحتاج مراجعة" },
      { subject: "العلوم الطبيعية", percent: 81, color: "amber", note: "قوي جدًا" },
    ],
    focus: "اليوم نثبت قوانين الحركة ونحوّلها إلى خطوات سهلة للحل.",
  });
  res.json(data);
});

router.get("/learning/summary-bank", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const data = await listSummaryBank(userId);
  res.json(GetSummaryBankResponse.parse(data));
});

router.get("/learning/error-bank", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const data = await listErrorBank(userId);
  res.json(data);
});

router.post("/learning/lessons/:lessonId/complete", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = CompleteLessonParams.safeParse(req.params);
  const body = CompleteLessonBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const error = !params.success ? params.error.message : !body.success ? body.error.message : "Invalid request";
    res.status(400).json({ error });
    return;
  }
  const data = await saveLessonSummary(userId, {
    lessonId: params.data.lessonId,
    lessonTitle: body.data.lesson_title,
    subject: body.data.subject,
    summary: body.data.summary,
    concepts: body.data.concepts,
  });
  res.status(201).json(CompleteLessonResponse.parse(data));
});

router.post("/learning/attempts", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = RecordLearningAttemptBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const data = await recordLearningAttempt(userId, {
    lessonId: body.data.lesson_id,
    lessonTitle: body.data.lesson_title,
    conceptId: body.data.concept_id,
    conceptTitle: body.data.concept_title,
    errorTag: body.data.error_tag,
    isCorrect: body.data.is_correct,
  });
  res.status(201).json(RecordLearningAttemptResponse.parse(data));
});

router.get("/learning/schedule", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const data = await listLearningSchedule(userId);
  res.json(GetLearningScheduleResponse.parse(data));
});

router.patch("/learning/schedule/:scheduleId", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateLearningScheduleParams.safeParse(req.params);
  const body = UpdateLearningScheduleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const error = !params.success ? params.error.message : !body.success ? body.error.message : "Invalid request";
    res.status(400).json({ error });
    return;
  }
  const data = await updateLearningSchedule(userId, params.data.scheduleId, body.data.completed);
  if (!data) {
    res.status(404).json({ error: "Schedule entry not found" });
    return;
  }
  res.json(UpdateLearningScheduleResponse.parse(data));
});

export default router;