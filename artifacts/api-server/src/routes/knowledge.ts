import { Router, type IRouter } from "express";
import {
  ListKnowledgeQueryParams,
  ListKnowledgeResponse,
  QueryKnowledgeBody,
  QueryKnowledgeResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const cards = [
  {
    id: "knowledge-newton-2",
    title: "القانون الثاني لنيوتن",
    summary: "تتناسب القوة المحصلة المؤثرة على جسم طرديًا مع تسارعه، ويكون اتجاه التسارع هو اتجاه القوة المحصلة.",
    subject: "الفيزياء",
    unit: "الميكانيك",
    lesson: "القوى والحركة",
    type: "مفهوم",
    difficulty: "متوسط",
    source: "كتاب الفيزياء - السنة الثانية ثانوي",
    page: 42,
    tags: ["القوة", "التسارع", "قوانين نيوتن"],
  },
  {
    id: "knowledge-motion",
    title: "الحركة المستقيمة المتغيرة بانتظام",
    summary: "عندما يكون التسارع ثابتًا، تتغير السرعة بالمقدار نفسه خلال فترات زمنية متساوية.",
    subject: "الفيزياء",
    unit: "الميكانيك",
    lesson: "الحركة",
    type: "ملخص",
    difficulty: "تمهيدي",
    source: "كتاب الفيزياء - السنة الثانية ثانوي",
    page: 28,
    tags: ["السرعة", "التسارع", "الحركة"],
  },
  {
    id: "knowledge-energy",
    title: "الطاقة الحركية",
    summary: "الطاقة التي يمتلكها الجسم بسبب حركته، وتساوي نصف جداء كتلته في مربع سرعته.",
    subject: "الفيزياء",
    unit: "الطاقة",
    lesson: "الطاقة الحركية",
    type: "قانون",
    difficulty: "متوسط",
    source: "كتاب الفيزياء - السنة الثانية ثانوي",
    page: 71,
    tags: ["الطاقة", "الكتلة", "السرعة"],
  },
  {
    id: "knowledge-electricity",
    title: "الدارة الكهربائية البسيطة",
    summary: "تحتاج الدارة إلى مولد وناقل ومستقبل، ويجب أن تكون مغلقة حتى يمر التيار الكهربائي.",
    subject: "الفيزياء",
    unit: "الكهرباء",
    lesson: "الدارة الكهربائية",
    type: "درس",
    difficulty: "تمهيدي",
    source: "كتاب الفيزياء - السنة الثانية ثانوي",
    page: 103,
    tags: ["التيار", "الدارة", "المولد"],
  },
];

router.get("/knowledge", (req, res): void => {
  const parsed = ListKnowledgeQueryParams.safeParse(req.query);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid knowledge filters");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { subject, curriculum_year: _curriculumYear } = parsed.data;
  const filtered = subject ? cards.filter((card) => card.subject === subject) : cards;
  res.json(ListKnowledgeResponse.parse(filtered));
});

router.post("/knowledge/query", (req, res): void => {
  const parsed = QueryKnowledgeBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid knowledge query");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query = parsed.data.query.trim().toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  const filtered = cards
    .filter((card) => !parsed.data.subject || card.subject === parsed.data.subject)
    .map((card) => {
      const haystack = `${card.title} ${card.summary} ${card.lesson} ${card.tags.join(" ")}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { card, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, parsed.data.n_results ?? 5)
    .map(({ card }) => card);

  const data = QueryKnowledgeResponse.parse({ query: parsed.data.query, results: filtered, count: filtered.length });
  res.json(data);
});

export default router;