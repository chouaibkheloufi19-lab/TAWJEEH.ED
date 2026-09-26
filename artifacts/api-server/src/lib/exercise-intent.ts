export type ExerciseIntent = "single_function" | "multi_topic" | "standard";

export const FUNCTION_REQUEST_PATTERN =
  /دال(?:ة|تان|ات|تين)|دوال|الدوال|نهايات|اشتقاق|مشتق|مماس|مقارب|تمثيل\s+بياني|وضع\s+نسبي|fonction|dérivée|limite|tangent|asymptote|function/i;

export function classifyExerciseIntent(
  studentRequest: string,
  mode: unknown,
  explicitPaper: boolean,
): ExerciseIntent {
  if (mode === "creative_topic") return "multi_topic";
  const request = studentRequest.trim();
  const asksForMultiple =
    /موضوع(?:\s+(?:متعدد|متعددة|شامل|كامل))?(?:\s+(?:ال)?تمارين|\s+(?:ال)?أسئلة)|(?:عدة|مجموعة|متعدد(?:ة)?|متنوع(?:ة)?|مختلف(?:ة)?|أكثر\s+من)\s+(?:ال)?تمارين|تمارين\s+(?:متعددة|متنوعة|مترابطة|عدة|مختلفة)|(?:موضوع|ورقة|اختبار|امتحان)\s+(?:بكالوريا|رسمي|شامل|كامل)|(?:full|multiple|several)\s+(?:exercises?|practice\s+paper|exam)/i.test(
      request,
    );
  if (asksForMultiple || explicitPaper || mode === "paper") {
    return "multi_topic";
  }
  if (FUNCTION_REQUEST_PATTERN.test(request)) {
    return "single_function";
  }
  return "standard";
}