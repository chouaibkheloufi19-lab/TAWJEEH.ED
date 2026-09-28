export type AcademicScope = {
  subject: string;
  curriculumYear?: string;
};

const SUBJECT_ALIASES: Record<string, string> = {
  math: "الرياضيات",
  "mathématique": "الرياضيات",
  mathematics: "الرياضيات",
  رياضيات: "الرياضيات",
  الرياضيات: "الرياضيات",
  physics: "العلوم الفيزيائية",
  physique: "العلوم الفيزيائية",
  فيزياء: "العلوم الفيزيائية",
  الفيزياء: "العلوم الفيزيائية",
  "العلوم الفيزيائية": "العلوم الفيزيائية",
  science: "العلوم الفيزيائية",
};

const SUBJECT_FILTER_ALIASES: Record<string, string[]> = {
  الرياضيات: ["الرياضيات"],
  "العلوم الفيزيائية": ["العلوم الفيزيائية", "الفيزياء"],
};

const CURRICULUM_YEAR_ALIASES: Record<string, string> = {
  "1as": "first_secondary",
  "2as": "second_secondary",
  "3as": "third_secondary",
  first_secondary: "first_secondary",
  second_secondary: "second_secondary",
  third_secondary: "third_secondary",
  "الأولى ثانوي": "first_secondary",
  "السنة الأولى ثانوي": "first_secondary",
  "الثانية ثانوي": "second_secondary",
  "السنة الثانية ثانوي": "second_secondary",
  "الثالثة ثانوي": "third_secondary",
  "السنة الثالثة ثانوي": "third_secondary",
  بكالوريا: "third_secondary",
};

const SUBJECT_INFERENCE_PATTERNS: Array<[RegExp, string]> = [
  [/رياضيات|دال(?:ة|تان|ات|تين)|دوال|نهايات|اشتقاق|مشتق|مماس|مقارب|math|function|derivative|limit|tangent|asymptote/i, "الرياضيات"],
  [/فيزياء|فيزيائي|حركة|نيوتن|قوة|طاقة|سرعة|تسارع|physics|physique/i, "العلوم الفيزيائية"],
  [/كيمياء|كيميائي|تفاعل|معايرة|تركيز|chemistry|chimie/i, "الكيمياء"],
  [/علوم الطبيعة|أحياء|بيولوجيا|خلية|وراثة|biology|biologie/i, "علوم الطبيعة والحياة"],
];

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function normalizeSubject(value: unknown): string {
  const subject = clean(value);
  if (!subject) return "";
  return SUBJECT_ALIASES[subject.toLocaleLowerCase()] ?? subject;
}

export function normalizeCurriculumYear(value: unknown): string {
  const year = clean(value);
  if (!year) return "";
  return CURRICULUM_YEAR_ALIASES[year.toLocaleLowerCase()] ?? year;
}

export function subjectFilterValues(subject: string): string[] {
  const normalized = normalizeSubject(subject);
  return SUBJECT_FILTER_ALIASES[normalized] ?? [normalized];
}

export function inferSubject(...values: unknown[]): string {
  const text = values.map(clean).filter(Boolean).join(" ");
  const matches = SUBJECT_INFERENCE_PATTERNS
    .filter(([pattern]) => pattern.test(text))
    .map(([, subject]) => subject);
  return matches.length === 1 ? matches[0] : "";
}

export function resolveAcademicScope(input: {
  subject?: unknown;
  curriculumYear?: unknown;
  inferenceText?: unknown[];
  requireSubject?: boolean;
}): AcademicScope {
  const subject = normalizeSubject(input.subject) || inferSubject(...(input.inferenceText ?? []));
  const curriculumYear = normalizeCurriculumYear(input.curriculumYear);
  if (input.requireSubject !== false && !subject) {
    throw new Error(
      "academic_scope_requires_subject: أرسل المادة بوضوح حتى لا تختلط مصادر مادة أخرى",
    );
  }
  return {
    subject,
    ...(curriculumYear ? { curriculumYear } : {}),
  };
}

export function isAcademicScopeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("academic_scope_requires_subject")
  );
}

export function scopeWhere(scope: AcademicScope): Record<string, string> {
  return {
    ...(scope.subject ? { subject: scope.subject } : {}),
    ...(scope.curriculumYear ? { curriculum_year: scope.curriculumYear } : {}),
  };
}

export function documentMatchesScope(
  metadata: Record<string, string | number> | undefined,
  scope: AcademicScope,
): boolean {
  const subject = String(metadata?.subject ?? "").trim();
  const year = String(metadata?.curriculum_year ?? "").trim();
  const subjectMatches =
    !scope.subject || subjectFilterValues(scope.subject).includes(subject);
  const yearMatches = !scope.curriculumYear || year === scope.curriculumYear;
  return subjectMatches && yearMatches;
}