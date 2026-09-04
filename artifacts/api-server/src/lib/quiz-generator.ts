import {
  assertGroundedNodeIds,
  formatRetrievedContext,
  retrieveGroundedKnowledge,
  type RetrievalContext,
} from "./rag";
import {
  ACADEMIC_EXAM_PROMPT,
  ADAPTIVE_EXERCISE_PROMPT,
  GROUNDED_CONTENT_RULES,
} from "./ai-prompts";

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

function parseQuestions(text: string, retrieval: RetrievalContext): GroundedQuizQuestion[] {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("Exercises Agent returned non-JSON content");
  const parsed = JSON.parse(candidate) as { questions?: GeneratedQuestion[] };
  if (!Array.isArray(parsed.questions) || parsed.questions.length < 3) {
    throw new Error("Exercises Agent returned too few questions");
  }

  const questions = parsed.questions.slice(0, 8).map((question, index) => {
    const options = Array.isArray(question.options)
      ? question.options.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : [];
    if (
      typeof question.prompt !== "string" ||
      typeof question.correctOption !== "string" ||
      typeof question.conceptId !== "string" ||
      typeof question.conceptTitle !== "string" ||
      options.length < 2 ||
      !options.includes(question.correctOption)
    ) {
      throw new Error(`Exercises Agent returned an invalid question at index ${index}`);
    }
    return {
      id: typeof question.id === "string" && question.id.trim() ? question.id : `grounded-${index + 1}`,
      prompt: question.prompt.trim(),
      options,
      correctOption: question.correctOption,
      conceptId: question.conceptId.trim(),
      conceptTitle: question.conceptTitle.trim(),
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
}): Promise<{ questions: GroundedQuizQuestion[]; retrieval: RetrievalContext }> {
  const retrieval = await retrieveGroundedKnowledge(
    [input.lesson, input.level, input.mode, input.errorContext, "اختبار وتمارين"].filter(Boolean).join(" "),
    { nResults: 10 },
  );
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");
  const promptPolicy = input.mode === "pre_exam" || input.mode === "error_stack"
    ? ACADEMIC_EXAM_PROMPT
    : ADAPTIVE_EXERCISE_PROMPT;
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      temperature: 0,
      max_tokens: 1800,
      messages: [
        {
          role: "system",
          content: [
            promptPolicy,
            GROUNDED_CONTENT_RULES,
            "هذه الواجهة تفاعلية، لذلك أعد أسئلة اختيار من متعدد بالعربية بصيغة JSON فقط. رتّب الأسئلة من الأساسيات إلى التطبيق ثم سؤال التحدي، مع مراعاة سجل الأخطاء لتحديد الأولوية. يجب أن تكون كل الخيارات والإجابة الصحيحة مدعومة بالمصادر.",
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
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Exercises Agent responded with ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Exercises Agent returned no questions");
  return { questions: parseQuestions(content, retrieval), retrieval };
}