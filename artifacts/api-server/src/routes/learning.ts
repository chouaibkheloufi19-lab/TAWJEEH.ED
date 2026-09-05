import { Router, type IRouter } from "express";
import {
  CompleteLessonBody,
  CompleteLessonParams,
  CompleteLessonResponse,
  GetBenchmarkLockResponse,
  GetDailyPointsQueryParams,
  GetDailyPointsResponse,
  GetDashboardResponse,
  GetErrorBankResponse,
  GetExamModeResponse,
  GetLearningNotificationsResponse,
  GetLearningScheduleResponse,
  GetProfileSummaryResponse,
  GetRemedialModulesResponse,
  GetSummaryBankResponse,
  GetWeeklyQuizEligibilityResponse,
  CreateProfileSummaryPdfResponse,
  DownloadProfileSummaryPdfParams,
  RecordLearningAttemptBody,
  RecordLearningAttemptResponse,
  UpdateLearningScheduleBody,
  UpdateLearningScheduleParams,
  UpdateLearningScheduleResponse,
} from "@workspace/api-zod";
import {
  getUserId,
  getExamMode,
  getBenchmarkLock,
  getDailyPoints,
  getProfileSummary,
  getProfileSummaryExport,
  getWeeklyQuizEligibility,
  listLearningNotifications,
  listRemedialModules,
  listErrorBank,
  listLearningSchedule,
  listSummaryBank,
  recordLearningAttempt,
  saveLessonSummary,
  updateLearningSchedule,
  saveProfileSummaryExport,
} from "../lib/learning-store";
import { savePrivatePdf, readPrivatePdf } from "../lib/generated-file-storage";
import { buildProfileSummaryPdf } from "../lib/profile-summary-pdf";
import {
  assertGroundedNodeIds,
  retrieveGroundedKnowledge,
  KnowledgeGroundingError,
} from "../lib/rag";

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
  res.json(GetErrorBankResponse.parse(data));
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
  res.json(GetErrorBankResponse.parse(data));
});

router.get("/learning/profile-summary", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(GetProfileSummaryResponse.parse(await getProfileSummary(userId)));
});

router.post("/learning/profile-summary/pdf", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const summary = await getProfileSummary(userId);
    const bytes = buildProfileSummaryPdf(summary);
    const objectPath = await savePrivatePdf(bytes, userId);
    const data = await saveProfileSummaryExport(userId, {
      objectPath,
      fileName: `tawjeeh-profile-summary-${new Date().toISOString().slice(0, 10)}.pdf`,
      sizeBytes: bytes.length,
    });
    res.status(201).json(CreateProfileSummaryPdfResponse.parse(data));
  } catch (error) {
    req.log.error({ error }, "Profile summary PDF generation failed");
    res.status(500).json({ error: "profile_summary_pdf_failed" });
  }
});

router.get("/learning/profile-summary/pdf/:exportId", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = DownloadProfileSummaryPdfParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const exportRow = await getProfileSummaryExport(userId, params.data.exportId);
  if (!exportRow) {
    res.status(404).json({ error: "PDF export not found" });
    return;
  }
  const file = await readPrivatePdf(exportRow.objectPath);
  if (!file) {
    res.status(404).json({ error: "PDF object not found" });
    return;
  }
  res.type(file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${exportRow.fileName}"`);
  res.send(file.bytes);
});

router.get("/learning/remedial-modules", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(GetRemedialModulesResponse.parse(await listRemedialModules(userId)));
});

router.get("/learning/notifications", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(GetLearningNotificationsResponse.parse(await listLearningNotifications(userId)));
});

router.get("/learning/daily-points", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = GetDailyPointsQueryParams.safeParse({
    date: typeof req.query.date === "string" ? req.query.date : undefined,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const date = parsed.data.date?.toISOString().slice(0, 10);
  res.json(GetDailyPointsResponse.parse(await getDailyPoints(userId, date)));
});

router.get("/learning/weekly-quiz-eligibility", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(GetWeeklyQuizEligibilityResponse.parse(await getWeeklyQuizEligibility(userId)));
});

router.get("/learning/benchmark-lock", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(GetBenchmarkLockResponse.parse(await getBenchmarkLock(userId)));
});

router.get("/learning/exam-mode", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const requestedExamDate = typeof req.query.exam_date === "string" ? req.query.exam_date : undefined;
  const data = await getExamMode(userId, requestedExamDate);
  res.json(GetExamModeResponse.parse(data));
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
  try {
    const retrieval = await retrieveGroundedKnowledge(body.data.grounding_query, { nResults: 12 });
    const groundingNodeIds = assertGroundedNodeIds(body.data.grounding_node_ids, retrieval);
    const data = await saveLessonSummary(userId, {
      lessonId: params.data.lessonId,
      lessonTitle: body.data.lesson_title,
      subject: body.data.subject,
      summary: body.data.summary,
      concepts: body.data.concepts,
      groundingQuery: retrieval.query,
      groundingNodeIds,
    });
    res.status(201).json(CompleteLessonResponse.parse(data));
  } catch (error) {
    req.log.error({ error }, "Grounded lesson summary could not be saved");
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "grounded_summary_save_failed",
      message: "لا يمكن حفظ الملخص قبل التحقق من عقده المصدرية في ChromaDB.",
    });
  }
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