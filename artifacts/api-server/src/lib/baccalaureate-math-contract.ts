type MathExamQuestion = {
  id: string;
  label: string;
  prompt: string;
  points: number;
};

type MathExamSection = {
  id: string;
  title: string;
  points: number;
  theme: string;
  context: string;
  data?: string;
  questions: MathExamQuestion[];
  sourceNodeIds: string[];
};

type MathCorrectionSection = {
  sectionId: string;
  criteria: Array<{ label: string; points: number }>;
};

type MathExerciseSection = {
  id: string;
  title: string;
  points: number;
  prompt: string;
  sourceNodeIds: string[];
};

const ACTION_VERBS =
  /عيّن|احسب|استنتج|ادرس|حل|أنشئ|مثّل|بيّن|أثبت|استخرج|قارن|حدّد|أوجد|استعمل|استنتج|برهن/i;
const FORBIDDEN_STUDENT_PATTERNS =
  /اختيار من متعدد|صح\s*(?:أو|و)?\s*خطأ|qcm|mcq|اشرح|لماذا|كيف\s+(?:يمكن|نستعمل|نحسب)|الحل النموذجي|التصحيح النموذجي|الإجابة الصحيحة/i;
const MATH_SUBJECT_PATTERN =
  /رياضيات|math(?:ématique|ematics)?|mathematics/i;
const OFFICIAL_MATH_QUESTION_LABEL = /^\d+\)(?:\s*[أ-ي])?$/u;

export function isMathematicsSubject(subject: string): boolean {
  return MATH_SUBJECT_PATTERN.test(subject);
}

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isHalfPointValue(value: number): boolean {
  return Number.isFinite(value) && value > 0 && Math.abs(value * 2 - Math.round(value * 2)) < 0.0001;
}

function assertPointsSum(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 0.0001) {
    throw new Error(`${label} points do not match their declared total`);
  }
}

/**
 * Strictly validates the Algerian baccalaureate-style mathematics paper
 * represented by the supplied reference sheets. This is intentionally
 * narrower than the generic grounded-paper contract.
 */
export function assertBaccalaureateMathExamContract(input: {
  title: string;
  duration: string;
  totalPoints: number;
  instructions: string[];
  sections: MathExamSection[];
  correctionSections: MathCorrectionSection[];
  retrievedNodeIds: string[];
}): void {
  if (!isMathematicsSubject(input.title) && input.title.length < 2) {
    throw new Error("Mathematics paper title is invalid");
  }
  if (!/موضوع|اختبار|بكالوريا|مراجعة|exam/i.test(input.title)) {
    throw new Error("Mathematics paper must have an official exam-style title");
  }
  if (!/ساع|ساعة|hour|h/i.test(input.duration)) {
    throw new Error("Mathematics paper must declare an exam duration");
  }
  if (input.totalPoints !== 20) {
    throw new Error("Mathematics paper must total exactly 20 points");
  }
  if (input.instructions.length < 2) {
    throw new Error("Mathematics paper must contain exam instructions");
  }
  if (input.sections.length !== 3) {
    throw new Error("Mathematics paper must contain exactly three exercises");
  }

  const retrieved = new Set(input.retrievedNodeIds);
  const sectionIds = new Set<string>();
  let sectionPoints = 0;

  for (const [sectionIndex, section] of input.sections.entries()) {
    if (
      !section.id ||
      sectionIds.has(section.id) ||
      !/تمرين|exercise/i.test(section.title) ||
      !section.theme ||
      !section.context ||
      !isHalfPointValue(section.points) ||
      section.questions.length < 2 ||
      section.questions.length > 8 ||
      !section.sourceNodeIds.length ||
      section.sourceNodeIds.some((nodeId) => !retrieved.has(nodeId))
    ) {
      throw new Error(`Mathematics exercise ${sectionIndex + 1} does not match the reference structure`);
    }
    sectionIds.add(section.id);
    sectionPoints += section.points;

    const sectionText = normalized(
      [
        section.title,
        section.theme,
        section.context,
        section.data ?? "",
        ...section.questions.map((question) => question.prompt),
      ].join(" "),
    );
    if (FORBIDDEN_STUDENT_PATTERNS.test(sectionText)) {
      throw new Error(`Mathematics exercise ${sectionIndex + 1} contains an out-of-style student instruction`);
    }

    const questionIds = new Set<string>();
    const labels = new Set<string>();
    let questionPoints = 0;
    for (const question of section.questions) {
      const prompt = normalized(question.prompt);
      if (
        !question.id ||
        questionIds.has(question.id) ||
        !question.label ||
        !OFFICIAL_MATH_QUESTION_LABEL.test(question.label) ||
        labels.has(question.label) ||
        !prompt ||
        !isHalfPointValue(question.points) ||
        !ACTION_VERBS.test(prompt)
      ) {
        throw new Error(`Mathematics exercise ${sectionIndex + 1} contains an invalid sub-question`);
      }
      questionIds.add(question.id);
      labels.add(question.label);
      questionPoints += question.points;
    }
    assertPointsSum(questionPoints, section.points, `Mathematics exercise ${sectionIndex + 1}`);
  }

  assertPointsSum(sectionPoints, input.totalPoints, "Mathematics paper");

  if (
    input.correctionSections.length !== input.sections.length ||
    input.correctionSections.some((correction) => {
      const section = input.sections.find((candidate) => candidate.id === correction.sectionId);
      if (!section || correction.criteria.length === 0) return true;
      return (
        correction.criteria.some(
          (criterion) => !criterion.label.trim() || !isHalfPointValue(criterion.points),
        ) ||
        Math.abs(
          correction.criteria.reduce((sum, criterion) => sum + criterion.points, 0) -
            section.points,
        ) > 0.0001
      );
    })
  ) {
    throw new Error("Mathematics correction guide must mirror all exercise marks");
  }
}

export function assertBaccalaureateMathExerciseContract(input: {
  title: string;
  prompt: string;
  totalPoints: number;
  sections: MathExerciseSection[];
  sourceNodeIds: string[];
  retrievedNodeIds: string[];
}): void {
  if (!input.title || !input.prompt || input.totalPoints !== 20) {
    throw new Error("Mathematics exercise paper has an invalid header");
  }
  if (input.sections.length !== 3) {
    throw new Error("Mathematics exercise paper must contain exactly three exercises");
  }
  const retrieved = new Set(input.retrievedNodeIds);
  const ids = new Set<string>();
  let points = 0;
  for (const [index, section] of input.sections.entries()) {
    const prompt = normalized(section.prompt);
    if (
      !section.id ||
      ids.has(section.id) ||
      !section.title ||
      !isHalfPointValue(section.points) ||
      !prompt ||
      !ACTION_VERBS.test(prompt) ||
      FORBIDDEN_STUDENT_PATTERNS.test(prompt) ||
      !section.sourceNodeIds.length ||
      section.sourceNodeIds.some((nodeId) => !retrieved.has(nodeId))
    ) {
      throw new Error(`Mathematics exercise ${index + 1} does not match the reference structure`);
    }
    ids.add(section.id);
    points += section.points;
  }
  assertPointsSum(points, input.totalPoints, "Mathematics exercise paper");
  if (input.sourceNodeIds.length === 0 || input.sourceNodeIds.some((nodeId) => !retrieved.has(nodeId))) {
    throw new Error("Mathematics exercise paper is not fully grounded");
  }
}