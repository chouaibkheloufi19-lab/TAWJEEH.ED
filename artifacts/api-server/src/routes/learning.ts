import { Router, type IRouter } from "express";
import { GetDashboardResponse } from "@workspace/api-zod";

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

export default router;