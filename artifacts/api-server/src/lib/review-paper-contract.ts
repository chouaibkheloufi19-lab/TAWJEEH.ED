export const FUNCTION_REVIEW_SECTION_IDS = [
  "domain",
  "limits",
  "derivative",
  "variations",
  "equations",
  "relative-position",
  "horizontal-discussion",
  "oblique-discussion",
  "graph",
  "synthesis",
] as const;

export const REVIEW_PAPER_DIFFICULTY = "advanced" as const;
export type ReviewPaperDifficulty = typeof REVIEW_PAPER_DIFFICULTY;

export type FunctionReviewSectionId = (typeof FUNCTION_REVIEW_SECTION_IDS)[number];

export type GroundedReviewSection = {
  id: string;
  points: number;
  prompt: string;
  sourceNodeIds: string[];
  evidence: string;
};

type RetrievedReviewSource = {
  id: string;
  document: string;
};

export function assertReviewPaperDifficulty(
  value: unknown,
): asserts value is ReviewPaperDifficulty {
  if (value !== REVIEW_PAPER_DIFFICULTY) {
    throw new Error("Review paper must explicitly declare advanced difficulty");
  }
}

function normalizeEvidence(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function assertGroundedReviewPaperContract(
  sections: GroundedReviewSection[],
  totalPoints: number,
  retrievedSources: RetrievedReviewSource[],
): void {
  if (sections.length !== FUNCTION_REVIEW_SECTION_IDS.length) {
    throw new Error("Review paper must contain all 10 required function-study sections");
  }

  const expectedIds = [...FUNCTION_REVIEW_SECTION_IDS];
  const actualIds = sections.map((section) => section.id);
  if (actualIds.some((id, index) => id !== expectedIds[index])) {
    throw new Error("Review paper sections are missing or out of order");
  }

  if (totalPoints !== 20 || sections.reduce((sum, section) => sum + section.points, 0) !== 20) {
    throw new Error("Review paper must total exactly 20 points");
  }

  const sourcesById = new Map(retrievedSources.map((source) => [
    source.id,
    normalizeEvidence(source.document),
  ]));
  for (const section of sections) {
    if (!section.prompt.trim() || section.points <= 0 || !section.evidence.trim()) {
      throw new Error(`Review paper section ${section.id} has no valid student prompt`);
    }
    if (
      !section.sourceNodeIds.length ||
      section.sourceNodeIds.some((nodeId) => !sourcesById.has(nodeId)) ||
      !section.sourceNodeIds.some((nodeId) =>
        sourcesById.get(nodeId)?.includes(normalizeEvidence(section.evidence)),
      )
    ) {
      throw new Error(`Review paper section ${section.id} has no matching retrieved evidence`);
    }
  }
}