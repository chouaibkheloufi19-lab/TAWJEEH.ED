type RetrievedSource = {
  id: string;
  document: string;
};

export type GroundedSourceTopicSection = {
  id: string;
  title: string;
  points: number;
  prompt: string;
  sourceNodeIds: string[];
  evidence: string;
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Validates a multi-exercise paper without imposing a subject-specific section
 * template. The source is responsible for the section order and labels.
 */
export function assertGroundedSourceTopicPaperContract(
  sections: GroundedSourceTopicSection[],
  totalPoints: number,
  retrievedSources: RetrievedSource[],
): void {
  if (sections.length < 2 || sections.length > 10) {
    throw new Error("Source topic paper must contain between two and ten sections");
  }
  if (
    totalPoints !== 20 ||
    sections.some((section) => section.points <= 0) ||
    sections.reduce((sum, section) => sum + section.points, 0) !== 20
  ) {
    throw new Error("Source topic paper must total exactly 20 points");
  }

  const sourceById = new Map(
    retrievedSources.map((source) => [source.id, normalize(source.document)]),
  );
  const sectionIds = new Set<string>();
  for (const section of sections) {
    if (
      !section.id.trim() ||
      sectionIds.has(section.id) ||
      !section.title.trim() ||
      !section.prompt.trim() ||
      !section.evidence.trim() ||
      !section.sourceNodeIds.length
    ) {
      throw new Error("Source topic paper contains an incomplete section");
    }
    sectionIds.add(section.id);
    const evidence = normalize(section.evidence);
    if (
      section.sourceNodeIds.some((nodeId) => !sourceById.has(nodeId)) ||
      !section.sourceNodeIds.some((nodeId) => sourceById.get(nodeId)?.includes(evidence))
    ) {
      throw new Error(`Source topic section ${section.id} has no matching retrieved evidence`);
    }
  }
}