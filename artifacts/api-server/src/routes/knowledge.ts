<<<<<<< HEAD
<<<<<<< HEAD
import { Router, type IRouter, type Response } from "express";
=======
<<<<<<< HEAD
import { Router, type IRouter, type Response } from "express";
=======
import { Router, type IRouter } from "express";
>>>>>>> origin/main
>>>>>>> origin/main
=======
import { Router, type IRouter, type Response } from "express";
>>>>>>> 9685650 (Update api server configuration and regenerate client schemas)
import {
  ListKnowledgeQueryParams,
  ListKnowledgeResponse,
  QueryKnowledgeBody,
  QueryKnowledgeResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
<<<<<<< HEAD
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> origin/main
=======
>>>>>>> 9685650 (Update api server configuration and regenerate client schemas)
const knowledgeBaseUrl = (
  process.env.KNOWLEDGE_BASE_URL ?? "http://127.0.0.1:8001/knowledge"
).replace(/\/$/, "");

type KnowledgeResult = {
  id: string;
  document?: string;
  metadata?: Record<string, string | number>;
};

type CatalogCard = {
  id: string;
  title: string;
  summary: string;
  subject: string;
  unit: string;
  lesson: string;
  type: string;
  difficulty: string;
  source: string;
  page: number;
  tags: string[];
};

function resultToCard(result: KnowledgeResult): CatalogCard {
  const metadata = result.metadata ?? {};
  const concepts = String(metadata.concepts ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const tags = [metadata.lesson, metadata.unit, ...concepts]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 5);
  return {
    id: result.id,
    title: String(metadata.lesson || metadata.unit || "مقطع تعليمي"),
    summary: String(result.document ?? ""),
    subject: String(metadata.subject ?? "غير محدد"),
    unit: String(metadata.unit ?? "غير محدد"),
    lesson: String(metadata.lesson ?? "غير محدد"),
    type: String(metadata.content_type ?? "reference"),
    difficulty: String(metadata.difficulty ?? "mixed"),
    source: String(metadata.source_file ?? "مصدر غير محدد"),
    page: Number(metadata.source_page ?? 0),
    tags,
  };
}

async function knowledgeFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${knowledgeBaseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(6000),
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Knowledge service responded with ${response.status}`);
  }
  return (await response.json()) as T;
}

function serviceUnavailable(res: Response): void {
  res.status(503).json({
    error: "knowledge_service_unavailable",
    message: "خدمة المعرفة غير متاحة حاليًا. حاول مرة أخرى بعد لحظات.",
  });
}

router.get("/knowledge", async (req, res): Promise<void> => {
<<<<<<< HEAD
<<<<<<< HEAD
=======
=======

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
>>>>>>> origin/main
>>>>>>> origin/main
=======
>>>>>>> 9685650 (Update api server configuration and regenerate client schemas)
  const parsed = ListKnowledgeQueryParams.safeParse(req.query);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid knowledge filters");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
<<<<<<< HEAD
<<<<<<< HEAD
=======
<<<<<<< HEAD

>>>>>>> origin/main
=======
>>>>>>> 9685650 (Update api server configuration and regenerate client schemas)
  const params = new URLSearchParams();
  if (parsed.data.subject) params.set("subject", parsed.data.subject);
  if (parsed.data.curriculum_year) {
    params.set("curriculum_year", parsed.data.curriculum_year);
  }

  try {
    const payload = await knowledgeFetch<{ sources: CatalogCard[] }>(
      `/v1/catalog${params.size ? `?${params.toString()}` : ""}`,
    );
    res.json(ListKnowledgeResponse.parse(payload.sources ?? []));
  } catch (error) {
    req.log.error({ error }, "Knowledge catalog request failed");
    serviceUnavailable(res);
  }
});

router.post("/knowledge/query", async (req, res): Promise<void> => {
<<<<<<< HEAD
<<<<<<< HEAD
=======
=======
  const { subject, curriculum_year: _curriculumYear } = parsed.data;
  const filtered = subject ? cards.filter((card) => card.subject === subject) : cards;
  res.json(ListKnowledgeResponse.parse(filtered));
});

router.post("/knowledge/query", (req, res): void => {
>>>>>>> origin/main
>>>>>>> origin/main
=======
>>>>>>> 9685650 (Update api server configuration and regenerate client schemas)
  const parsed = QueryKnowledgeBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid knowledge query");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
<<<<<<< HEAD
<<<<<<< HEAD
=======
<<<<<<< HEAD

>>>>>>> origin/main
=======
>>>>>>> 9685650 (Update api server configuration and regenerate client schemas)
  const where = parsed.data.subject ? { subject: parsed.data.subject } : undefined;
  try {
    const payload = await knowledgeFetch<{
      query: string;
      results: KnowledgeResult[];
      count: number;
    }>("/v1/query", {
      method: "POST",
      body: JSON.stringify({
        query: parsed.data.query,
        n_results: parsed.data.n_results ?? 8,
        where,
      }),
    });
    const cards = (payload.results ?? []).map(resultToCard);
    res.json(
      QueryKnowledgeResponse.parse({
        query: parsed.data.query,
        results: cards,
        count: cards.length,
      }),
    );
  } catch (error) {
    req.log.error({ error }, "Knowledge query request failed");
    serviceUnavailable(res);
  }
<<<<<<< HEAD
<<<<<<< HEAD
=======
=======
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
>>>>>>> origin/main
>>>>>>> origin/main
=======
>>>>>>> 9685650 (Update api server configuration and regenerate client schemas)
});

export default router;