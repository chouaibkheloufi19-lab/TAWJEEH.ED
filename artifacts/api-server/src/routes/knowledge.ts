import { Router, type IRouter, type Response } from "express";
import {
  ListKnowledgeQueryParams,
  ListKnowledgeResponse,
  QueryKnowledgeBody,
  QueryKnowledgeResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
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
  const parsed = ListKnowledgeQueryParams.safeParse(req.query);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid knowledge filters");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

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
  const parsed = QueryKnowledgeBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid knowledge query");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

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
});

export default router;