import {
  assertGroundedNodeIds,
  formatRetrievedContext,
  retrieveGroundedKnowledge,
  type RetrievalContext,
} from "./rag";
import {
  ACADEMIC_EXAM_PROMPT,
  ADAPTIVE_EXERCISE_PROMPT,
  EXERCISE_GENERATION_PROMPT,
  GROUNDED_CONTENT_RULES,
  LEARNER_SAFE_OUTPUT_RULES,
} from "./ai-prompts";
import {
  callDeepSeekTextModelWithRetry,
  shouldUseGroundedProviderFallback,
} from "./ai-provider";

export type GroundedQuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctOption: string;
  conceptId: string;
  conceptTitle: string;
  sourceNodeIds: string[];
};

type GeneratedQuestion = {
  id?: unknown;
  prompt?: unknown;
  options?: unknown;
  correctOption?: unknown;
  conceptId?: unknown;
  conceptTitle?: unknown;
  sourceNodeIds?: unknown;
};

function removeUnpairedSurrogates(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value[index] + value[index + 1];
        index += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    result += value[index];
  }
  return result;
}

function fallbackText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = removeUnpairedSurrogates(value.replace(/\s+/g, " ").trim());
  return cleaned || fallback;
}

function buildGroundedQuizFallback(
  retrieval: RetrievalContext,
  questionCount: number,
): GroundedQuizQuestion[] {
  const documents = retrieval.documents.filter((document) => document.id);
  if (!documents.length) {
    throw new Error("Cannot build a quiz fallback without grounded documents");
  }

  const concepts = documents.map((document) => {
    const metadata = document.metadata ?? {};
    return fallbackText(
      metadata.concepts || metadata.lesson || metadata.unit || metadata.subject,
      "المفهوم الوارد في المصدر",
    );
  });

  return Array.from({ length: questionCount }, (_, index) => {
    const document = documents[index % documents.length];
    const metadata = document.metadata ?? {};
    const concept = concepts[index % concepts.length];
    const excerpt = fallbackText(
      fallbackText(document.document, "لا يتوفر مقتطف نصي قصير لهذا المصدر.").slice(0, 120),
      "لا يتوفر مقتطف نصي قصير لهذا المصدر.",
    );
    const options = [
      excerpt,
      "لا يذكر المصدر هذا المقتطف",
      "المصدر يعرض عنوانًا فقط دون محتوى",
      "المقتطف يخص موضوعًا مختلفًا",
    ];
    return {
      id: `grounded-fallback-${index + 1}`,
      prompt: `بالرجوع إلى المصدر الموثق المرتبط بمفهوم «${concept}»، أي عبارة تطابق المقتطف المسترجع؟`,
      options,
      correctOption: excerpt,
      conceptId: fallbackText(
        metadata.lesson_keys || metadata.lesson || metadata.unit,
        "grounded-source",
      ),
      conceptTitle: concept,
      sourceNodeIds: [document.id],
    };
  });
}

function parseQuestions(
  text: string,
  retrieval: RetrievalContext,
  questionCount: number,
): GroundedQuizQuestion[] {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("Exercises Agent returned non-JSON content");
  const parsed = JSON.parse(candidate) as { questions?: GeneratedQuestion[] };
  if (!Array.isArray(parsed.questions) || parsed.questions.length < questionCount) {
    throw new Error(`Exercises Agent returned fewer than ${questionCount} questions`);
  }

  const questions = parsed.questions.slice(0, questionCount).map((question, index) => {
    const options = Array.isArray(question.options)
      ? question.options
          .filter((item): item is string => typeof item === "string")
          .map((item) => fallbackText(item, ""))
          .filter(Boolean)
      : [];
    const prompt = fallbackText(question.prompt, "");
    const correctOption = fallbackText(question.correctOption, "");
    const conceptId = fallbackText(question.conceptId, "");
    const conceptTitle = fallbackText(question.conceptTitle, "");
    if (
      !prompt ||
      !correctOption ||
      !conceptId ||
      !conceptTitle ||
      options.length < 2 ||
      !options.includes(correctOption)
    ) {
      throw new Error(`Exercises Agent returned an invalid question at index ${index}`);
    }
    return {
      id: fallbackText(question.id, `grounded-${index + 1}`),
      prompt,
      options,
      correctOption,
      conceptId,
      conceptTitle,
      sourceNodeIds: assertGroundedNodeIds(question.sourceNodeIds, retrieval),
    };
  });
  return questions;
}

export async function generateGroundedQuizQuestions(input: {
  lesson: string;
  mode: string;
  level: string;
  errorContext: string;
  questionCount?: number;
}): Promise<{ questions: GroundedQuizQuestion[]; retrieval: RetrievalContext }> {
  const questionCount = Math.max(3, Math.min(input.questionCount ?? 6, 12));
  const retrieval = await retrieveGroundedKnowledge(
    [input.lesson, input.level, input.mode, input.errorContext, "اختبار وتمارين"].filter(Boolean).join(" "),
    { nResults: 10 },
  );
  const promptPolicy = input.mode === "pre_exam" || input.mode === "error_stack"
    ? ACADEMIC_EXAM_PROMPT
    : ADAPTIVE_EXERCISE_PROMPT;
  try {
    const content = await callDeepSeekTextModelWithRetry(
      [
        {
          role: "system",
          content: [
            promptPolicy,
            EXERCISE_GENERATION_PROMPT,
            GROUNDED_CONTENT_RULES,
            LEARNER_SAFE_OUTPUT_RULES,
            `هذه الواجهة تفاعلية، لذلك أعد ${questionCount} سؤال اختيار من متعدد بالعربية بصيغة JSON فقط. رتّب الأسئلة من الأساسيات إلى التطبيق ثم سؤال التحدي، مع مراعاة سجل الأخطاء لتحديد الأولوية. يجب أن تكون كل الخيارات والإجابة الصحيحة مدعومة بالمصادر.`,
            'أعد الشكل: {"questions":[{"id":"q1","prompt":"...","options":["...","...","...","..."],"correctOption":"...","conceptId":"...","conceptTitle":"...","sourceNodeIds":["node-id"]}]}',
          ].join("\n\n"),
        },
        {
          role: "user",
          content: [
            `الدرس: ${input.lesson}`,
            `المستوى: ${input.level || "3AS"}`,
            `النمط: ${input.mode}`,
            `سجل الأخطاء: ${input.errorContext || "لا توجد أخطاء محفوظة"}`,
            "عقد المتجه المسترجعة من ChromaDB:",
            formatRetrievedContext(retrieval.documents),
          ].join("\n"),
        },
      ],
      { temperature: 0, maxOutputTokens: 2400, jsonMode: true },
      { maxAttempts: 3, baseDelayMs: 500 },
    );
    return { questions: parseQuestions(content, retrieval, questionCount), retrieval };
  } catch (error) {
    if (!shouldUseGroundedProviderFallback(error)) throw error;
    return {
      questions: buildGroundedQuizFallback(retrieval, questionCount),
      retrieval,
    };
  }
}