import { Router, type IRouter, type Request, type Response } from "express";
import {
  ListKnowledgeQueryParams,
  ListKnowledgeResponse,
  QueryKnowledgeBody,
  QueryKnowledgeResponse,
} from "@workspace/api-zod";
import { getKnowledgeStatus, knowledgeFetch } from "../lib/rag";

const router: IRouter = Router();
export const knowledgeStatusRouter: IRouter = Router();
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

async function knowledgeStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const payload = await getKnowledgeStatus();
    const count = Number(payload.count ?? 0);
    res.json({
      status: payload.status === "ok" && count > 0 ? "ready" : "empty",
      service: payload.service ?? "tawjeeh-knowledge-base",
      collection: payload.collection ?? "tawjeeh_knowledge",
      indexedNodes: count,
      message:
        count > 0
          ? "RAG retrieval is connected to the learning agents."
          : "The knowledge collection has no indexed vector nodes.",
    });
  } catch (error) {
    req.log.error({ error }, "Knowledge readiness request failed");
    serviceUnavailable(res);
  }
}

knowledgeStatusRouter.get("/knowledge/status", knowledgeStatusHandler);

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