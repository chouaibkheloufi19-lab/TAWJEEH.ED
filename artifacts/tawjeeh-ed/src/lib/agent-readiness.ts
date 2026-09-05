import { fetchWithTimeout } from '@/lib/request';

export type AgentReadiness = {
  status: string;
  retrieval: {
    status: string;
    query: string;
    retrievedNodeIds: string[];
    sources: { nodeId: string; title: string; source: string; page: number; quote: string }[];
  };
  foundationalModules: {
    nodeId: string;
    title: string;
    studyTitle: string;
    summary: string;
    source: string;
    page: number;
    concepts: string;
  }[];
  agents: Record<string, { status: string; role: string; nodeIds: string[] }>;
};

type ReadinessErrorPayload = {
  message?: string;
};

export async function fetchAgentReadiness(): Promise<AgentReadiness> {
  const response = await fetchWithTimeout(
    '/api/agents/readiness',
    { credentials: 'include' },
    15_000,
  );
  let payload: ReadinessErrorPayload & Partial<AgentReadiness> = {};
  try {
    payload = await response.json() as ReadinessErrorPayload & Partial<AgentReadiness>;
  } catch {
    // Preserve the HTTP failure below when the service returns a non-JSON body.
  }
  if (!response.ok) {
    throw new Error(payload.message || 'لا تتوفر مواد الدرس الآن. أعد المحاولة بعد قليل.');
  }
  return payload as AgentReadiness;
}

export function getAgentReadinessQueryOptions(userId?: string) {
  return {
    queryKey: ['agent-readiness', userId ?? 'signed-out'] as const,
    queryFn: fetchAgentReadiness,
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1_000 * 2 ** attemptIndex, 5_000),
  };
}