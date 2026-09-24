export const SCIENCE_REVIEW_SECTION_IDS = [
  "data",
  "law",
  "calculation",
  "interpretation",
  "synthesis",
] as const;

type ScientificSource = {
  id: string;
  document: string;
  metadata?: Record<string, unknown>;
};

type ScientificSection = {
  id: string;
  points: number;
  prompt: string;
  sourceNodeIds: string[];
  evidence: string;
};

export type GroundedScientificScenario<TSource extends ScientificSource = ScientificSource> = {
  source: TSource;
  text: string;
  evidence: string;
};

const MEASUREMENT_PATTERN =
  /[-+]?\d+(?:[.,]\d+)?\s*(?:m\s*\/\s*s|m\s*\.\s*s(?:\s*[-−]?\s*1)?|mol\s*\/\s*l|km|cm|mm|kg|mg|g|n|j|w|pa|mol|ml|l|°\s*c|k|m(?![a-z])|s|min|h|a|v|ω|متر|سم|كلم|كم|كغ|غ|ثانية|ث|دقيقة|ساعة|نيوتن|جول|واط|باسكال|مول|لتر|مل|أمبير|فولت|كلفن|درجة)/giu;

function normalizeScientificText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[٫٬]/g, ".")
    .replace(/[−–]/g, "-");
}

function measurementsIn(value: string): string[] {
  return normalizeScientificText(value).match(MEASUREMENT_PATTERN) ?? [];
}

function measuredNumbers(value: string): Set<number> {
  return new Set(
    measurementsIn(value)
      .map((measurement) => measurement.match(/[-+]?\d+(?:[.,]\d+)?/)?.[0])
      .filter((number): number is string => Boolean(number))
      .map((number) => Number(number.replace(",", ".")))
      .filter(Number.isFinite),
  );
}

function arabicLetterCount(value: string): number {
  return (value.match(/[\u0600-\u06ff]/g) ?? []).length;
}

function extractScenarioText(document: string): string {
  const sourceText = document.replace(/\r/g, "").trim();
  if (!sourceText) return "";

  const firstQuestion = /(?:^|\n)\s*(?:[1-9٠-٩۰-۹])\s*(?:[.)\-–]\s*|\n)/m.exec(sourceText);
  let scenario = firstQuestion && firstQuestion.index >= 120
    ? sourceText.slice(0, firstQuestion.index).trim()
    : sourceText;

  const solutionStart =
    /(?:^|\n)\s*(?:الحل النموذجي|الحل|نحسب\b|بالتعويض\b|ومنه نجد\b|إذن\b)/u.exec(scenario);
  if (solutionStart && solutionStart.index >= 100) {
    scenario = scenario.slice(0, solutionStart.index).trim();
  }

  if (measurementsIn(scenario).length < 2) {
    scenario = sourceText;
  }

  if (scenario.length > 1800) {
    const shortened = scenario.slice(0, 1800);
    scenario = shortened.slice(0, shortened.lastIndexOf(" "));
  }
  return scenario;
}

function scenarioScore(
  source: ScientificSource,
  scenario: string,
  topic: string,
  subject: string,
): number {
  const searchable = normalizeScientificText(
    `${scenario} ${String(source.metadata?.lesson ?? "")} ${String(source.metadata?.unit ?? "")}`,
  ).toLocaleLowerCase();
  const requested = normalizeScientificText(`${topic} ${subject}`).toLocaleLowerCase();
  const metadataSubject = normalizeScientificText(
    String(source.metadata?.subject ?? ""),
  ).toLocaleLowerCase();

  if (
    /فيزياء|فيزيائي|physics/i.test(requested) &&
    /رياضيات|math|أدب|biology|أحياء/i.test(metadataSubject)
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const topicWords = requested
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3);
  const topicMatches = topicWords.filter((word) => searchable.includes(word)).length;
  const contentType = String(source.metadata?.content_type ?? "").toLocaleLowerCase();

  return measurementsIn(scenario).length * 3
    + (/(?:المعطيات|يهدف التمرين|نريد دراسة|لدراسة|نعتبر|عند اللحظة)/u.test(scenario) ? 5 : 0)
    + (/(?:حركة|مسار|سرعة|تسارع|قوة|طاقة|قمر|سقوط|رمي|كتلة|ضغط|غاز|تفاعل|حرارة|ناقلية)/u.test(scenario) ? 4 : 0)
    + topicMatches * 2
    + (/exercise|assessment|exam|تمرين|اختبار/u.test(contentType) ? 2 : 0)
    - (/solution/u.test(contentType) ? 1 : 0);
}

export function selectGroundedScientificScenario<TSource extends ScientificSource>(
  sources: TSource[],
  topic: string,
  subject: string,
): GroundedScientificScenario<TSource> | undefined {
  const candidates = sources
    .filter((source) => source.id && typeof source.document === "string")
    .map((source) => {
      const text = extractScenarioText(source.document);
      const score = scenarioScore(source, text, topic, subject);
      return { source, text, score };
    })
    .filter(({ text, score }) =>
      score > Number.NEGATIVE_INFINITY
      && text.length >= 120
      && arabicLetterCount(text) >= 60
      && measurementsIn(text).length >= 2,
    )
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (!best) return undefined;

  return {
    source: best.source,
    text: best.text,
    evidence: best.text.slice(0, 220).trim(),
  };
}

export function assertGroundedScienceReviewPaperContract(
  problemPrompt: string,
  sections: ScientificSection[],
  totalPoints: number,
  retrievedSources: Array<{ id: string; document: string }>,
): void {
  if (
    sections.length !== SCIENCE_REVIEW_SECTION_IDS.length ||
    sections.some((section, index) => section.id !== SCIENCE_REVIEW_SECTION_IDS[index])
  ) {
    throw new Error("Science paper must contain the five required sections in order");
  }

  if (
    totalPoints !== 20 ||
    sections.some((section) => section.points <= 0) ||
    sections.reduce((sum, section) => sum + section.points, 0) !== 20
  ) {
    throw new Error("Science paper must total exactly 20 points");
  }

  const promptMeasurements = measurementsIn(problemPrompt);
  if (promptMeasurements.length < 2) {
    throw new Error("Science paper prompt must include at least two measured givens with units");
  }

  const sourceNumbers = new Set(
    retrievedSources.flatMap((source) => [...measuredNumbers(source.document)]),
  );
  const supportedPromptNumbers = measuredNumbers(problemPrompt);
  const supportedCount = [...supportedPromptNumbers].filter((number) =>
    sourceNumbers.has(number),
  ).length;
  if (supportedCount < 2) {
    throw new Error("Science paper prompt has fewer than two numerical givens supported by sources");
  }

  const sourcesById = new Map(
    retrievedSources.map((source) => [
      source.id,
      normalizeScientificText(source.document).toLocaleLowerCase().replace(/\s+/g, " "),
    ]),
  );

  for (const section of sections) {
    const evidence = normalizeScientificText(section.evidence)
      .toLocaleLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!section.prompt.trim() || !evidence || !section.sourceNodeIds.length) {
      throw new Error(`Science paper section ${section.id} is missing grounded content`);
    }
    if (
      section.sourceNodeIds.some((nodeId) => !sourcesById.has(nodeId)) ||
      !section.sourceNodeIds.some((nodeId) => sourcesById.get(nodeId)?.includes(evidence))
    ) {
      throw new Error(`Science paper section ${section.id} has no matching retrieved evidence`);
    }
  }
}