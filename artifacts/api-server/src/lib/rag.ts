export type KnowledgeDocument = {
  id: string;
  document?: string;
  metadata?: Record<string, string | number>;
};

export type GroundingSource = {
  nodeId: string;
  title: string;
  source: string;
  page: number;
  quote: string;
};

export type RetrievalContext = {
  status: "ready";
  query: string;
  documents: KnowledgeDocument[];
  grounding: {
    status: "ready";
    query: string;
    retrievedNodeIds: string[];
    sources: GroundingSource[];
  };
};

export type AgentReadiness = {
  status: "ready";
  retrieval: RetrievalContext["grounding"];
  foundationalModules: Array<{
    nodeId: string;
    title: string;
    studyTitle: string;
    summary: string;
    source: string;
    page: number;
    concepts: string;
  }>;
  agents: {
    faheem: { status: "ready"; role: "diagnostic"; nodeIds: string[] };
    dalil: { status: "ready"; role: "explanation"; nodeIds: string[] };
    exercises: { status: "ready"; role: "practice"; nodeIds: string[] };
  };
};

export class KnowledgeGroundingError extends Error {
  readonly code = "knowledge_retrieval_empty";

  constructor(message = "No grounded knowledge nodes were retrieved") {
    super(message);
    this.name = "KnowledgeGroundingError";
  }
}

const knowledgeBaseUrl = (
  process.env.KNOWLEDGE_BASE_URL ?? "http://127.0.0.1:8001/knowledge"
).replace(/\/$/, "");

export async function knowledgeFetch<T>(
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

function isGroundedDocument(
  document: KnowledgeDocument,
): document is KnowledgeDocument & { document: string } {
  const metadata = document.metadata ?? {};
  return Boolean(
    document.id &&
      typeof document.document === "string" &&
      document.document.trim() &&
      String(metadata.source_file ?? "").trim(),
  );
}

export function sourceDocumentsFrom(
  documents: KnowledgeDocument[],
): GroundingSource[] {
  return documents.slice(0, 5).map((item) => {
    const metadata = item.metadata ?? {};
    return {
      nodeId: item.id,
      title: "مرجع دراسي",
      source: String(metadata.source_file || "مصدر غير محدد"),
      page: Number(metadata.source_page || 0),
      quote: (item.document ?? "").trim().replace(/\s+/g, " ").slice(0, 320),
    };
  });
}

export function formatRetrievedContext(documents: KnowledgeDocument[]): string {
  return documents
    .map((item, index) => {
      const metadata = item.metadata ?? {};
      return [
        `[عقدة المتجه ${item.id}] المصدر ${index + 1}: ${metadata.lesson || metadata.unit || "درس"}`,
        `المادة: ${metadata.subject || "غير محددة"}`,
        `الملف: ${metadata.source_file || "غير محدد"}، الصفحة: ${metadata.source_page || 0}`,
        `المفاهيم: ${metadata.concepts || "غير محددة"}`,
        `المحتوى المقتبس: ${(item.document || "").slice(0, 2200)}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function assertGroundedNodeIds(
  sourceNodeIds: unknown,
  retrieval: RetrievalContext,
): string[] {
  if (!Array.isArray(sourceNodeIds)) {
    throw new KnowledgeGroundingError(
      "Generated content must cite the retrieved ChromaDB node IDs",
    );
  }
  const cited = [...new Set(sourceNodeIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
  const allowed = new Set(retrieval.documents.map((document) => document.id));
  if (!cited.length || cited.some((nodeId) => !allowed.has(nodeId))) {
    throw new KnowledgeGroundingError(
      "Generated content cited a node that was not retrieved for this request",
    );
  }
  return cited;
}

export async function retrieveGroundedKnowledge(
  query: string,
  options: {
    nResults?: number;
    where?: Record<string, string | number>;
  } = {},
): Promise<RetrievalContext> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) {
    throw new KnowledgeGroundingError("Knowledge retrieval requires a meaningful query");
  }

  const payload = await knowledgeFetch<{
    query?: string;
    results?: KnowledgeDocument[];
  }>("/v1/query", {
    method: "POST",
    body: JSON.stringify({
      query: cleanQuery,
      n_results: options.nResults ?? 8,
      where: options.where,
    }),
  });
  const documents = (payload.results ?? []).filter(isGroundedDocument);
  if (!documents.length) {
    throw new KnowledgeGroundingError(
      "The knowledge base returned no indexed source nodes for this request",
    );
  }
  const sources = sourceDocumentsFrom(documents);
  return {
    status: "ready",
    query: payload.query || cleanQuery,
    documents,
    grounding: {
      status: "ready",
      query: payload.query || cleanQuery,
      retrievedNodeIds: documents.map((document) => document.id),
      sources,
    },
  };
}

export async function provisionLearningAgents(): Promise<AgentReadiness> {
  const retrieval = await retrieveGroundedKnowledge(
    "المفاهيم الأساسية في قوانين نيوتن والحركة: القصور الذاتي، القوة المحصلة، التسارع، الحركة، الأمثلة والتمارين",
    {
      nResults: 12,
      where: {
        curriculum_year: "third_secondary",
        subject: "العلوم الفيزيائية",
      },
    },
  );
  const foundationalModules = retrieval.documents.map((document) => {
    const metadata = document.metadata ?? {};
    return {
      nodeId: document.id,
      title: String(metadata.lesson || metadata.unit || "مفهوم تأسيسي"),
      studyTitle: String(metadata.unit || metadata.lesson || "محور دراسي"),
      summary: String(document.document || "").trim(),
      source: String(metadata.source_file || "مصدر غير محدد"),
      page: Number(metadata.source_page || 0),
      concepts: String(metadata.concepts || ""),
    };
  });
  const nodeIds = retrieval.grounding.retrievedNodeIds;
  return {
    status: "ready",
    retrieval: retrieval.grounding,
    foundationalModules,
    agents: {
      faheem: { status: "ready", role: "diagnostic", nodeIds },
      dalil: { status: "ready", role: "explanation", nodeIds },
      exercises: { status: "ready", role: "practice", nodeIds },
    },
  };
}

export async function getKnowledgeStatus() {
  return knowledgeFetch<{
    status?: string;
    service?: string;
    collection?: string;
    count?: number;
  }>("/healthz");
}