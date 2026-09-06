import { Router, type IRouter } from "express";
import {
  assertGroundedNodeIds,
  formatRetrievedContext,
  KnowledgeGroundingError,
  retrieveGroundedKnowledge,
  sourceDocumentsFrom,
  type RetrievalContext,
} from "../lib/rag";
import {
  ACADEMIC_EXAM_PROMPT,
  CREATIVE_IDEAS_PROMPT,
  EXERCISE_GENERATION_PROMPT,
  GROUNDED_CONTENT_RULES,
  LEARNER_SAFE_OUTPUT_RULES,
} from "../lib/ai-prompts";
import { callDeepSeekTextModel } from "../lib/ai-provider";

const router: IRouter = Router();

type CreativeIdea = {
  title: string;
  approach: string;
  steps: string[];
  creativeTwist: string;
  expectedOutcome: string;
  sourceNodeIds: string[];
};

export type CreativeIdeasResponse = {
  status: "generated";
  lessonTitle: string;
  solutionSummary: string;
  ideas: CreativeIdea[];
  sourceDocuments: ReturnType<typeof sourceDocumentsFrom>;
  sourceNodeIds: string[];
  grounding: RetrievalContext["grounding"];
};

type GeneratedExamQuestion = {
  id: string;
  label: string;
  prompt: string;
  points: number;
};

type GeneratedExamSection = {
  id: string;
  title: string;
  points: number;
  theme: string;
  context: string;
  data?: string;
  questions: GeneratedExamQuestion[];
};

type GeneratedExamResponse = {
  status: "generated";
  title: string;
  subject: string;
  track: string;
  grade: string;
  duration: string;
  totalPoints: number;
  instructions: string[];
  sections: GeneratedExamSection[];
  correction: {
    title: string;
    introduction: string;
    sections: Array<{
      sectionId: string;
      title: string;
      solutionSteps: string[];
      criteria: Array<{ label: string; points: number }>;
    }>;
  };
  sourceDocuments: ReturnType<typeof sourceDocumentsFrom>;
  sourceNodeIds: string[];
  grounding: RetrievalContext["grounding"];
};

function extractJsonObject(text: string, label: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced) return fenced;
  const start = text.indexOf("{");
  if (start < 0) throw new Error(`${label} returned non-JSON content`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && inString) { escaped = true; continue; }
    if (character === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error(`${label} returned incomplete JSON`);
}

function parseGeneratedExam(text: string, retrieval: RetrievalContext): GeneratedExamResponse {
  const parsed = JSON.parse(extractJsonObject(text, "Exam generator")) as Partial<GeneratedExamResponse>;
  if (
    typeof parsed.title !== "string" ||
    typeof parsed.subject !== "string" ||
    typeof parsed.track !== "string" ||
    typeof parsed.grade !== "string" ||
    typeof parsed.duration !== "string" ||
    typeof parsed.totalPoints !== "number" ||
    !Array.isArray(parsed.instructions) ||
    !Array.isArray(parsed.sections) ||
    parsed.sections.length < 2 ||
    !parsed.correction ||
    typeof parsed.correction.title !== "string" ||
    typeof parsed.correction.introduction !== "string" ||
    !Array.isArray(parsed.correction.sections) ||
    !Array.isArray(parsed.sourceNodeIds)
  ) {
    throw new Error("Exam generator returned an incomplete response");
  }
  const sections = parsed.sections.slice(0, 4).map((section, index) => {
    if (
      !section ||
      typeof section.id !== "string" ||
      typeof section.title !== "string" ||
      typeof section.points !== "number" ||
      typeof section.theme !== "string" ||
      typeof section.context !== "string" ||
      !Array.isArray(section.questions) ||
      section.questions.length < 2
    ) throw new Error(`Exam generator returned an invalid section at index ${index}`);
    const questions = section.questions.slice(0, 7).map((question, questionIndex) => {
      if (
        !question ||
        typeof question.id !== "string" ||
        typeof question.label !== "string" ||
        typeof question.prompt !== "string" ||
        typeof question.points !== "number" ||
        question.points <= 0
      ) throw new Error(`Exam generator returned an invalid question at ${index}:${questionIndex}`);
      return { id: question.id.trim(), label: question.label.trim(), prompt: question.prompt.trim(), points: question.points };
    });
    return {
      id: section.id.trim(),
      title: section.title.trim(),
      points: section.points,
      theme: section.theme.trim(),
      context: section.context.trim(),
      data: typeof section.data === "string" ? section.data.trim() : undefined,
      questions,
    };
  });
  const correctionSections = parsed.correction.sections.slice(0, sections.length).map((section, index) => {
    if (
      !section ||
      typeof section.sectionId !== "string" ||
      typeof section.title !== "string" ||
      !Array.isArray(section.solutionSteps) ||
      section.solutionSteps.length < 2 ||
      !Array.isArray(section.criteria) ||
      section.criteria.length < 1
    ) throw new Error(`Exam generator returned an invalid correction section at index ${index}`);
    return {
      sectionId: section.sectionId.trim(),
      title: section.title.trim(),
      solutionSteps: section.solutionSteps.filter((step): step is string => typeof step === "string" && Boolean(step.trim())).slice(0, 12),
      criteria: section.criteria
        .filter((criterion): criterion is { label: string; points: number } => Boolean(criterion) && typeof criterion.label === "string" && typeof criterion.points === "number")
        .slice(0, 8)
        .map((criterion) => ({ label: criterion.label.trim(), points: criterion.points })),
    };
  });
  if (correctionSections.length !== sections.length || correctionSections.some((section) => section.solutionSteps.length < 2 || !section.criteria.length)) {
    throw new Error("Exam generator returned an incomplete correction guide");
  }
  return {
    status: "generated",
    title: parsed.title.trim(),
    subject: parsed.subject.trim(),
    track: parsed.track.trim(),
    grade: parsed.grade.trim(),
    duration: parsed.duration.trim(),
    totalPoints: parsed.totalPoints,
    instructions: parsed.instructions.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 5),
    sections,
    correction: {
      title: parsed.correction.title.trim(),
      introduction: parsed.correction.introduction.trim(),
      sections: correctionSections,
    },
    sourceDocuments: sourceDocumentsFrom(retrieval.documents),
    sourceNodeIds: assertGroundedNodeIds(parsed.sourceNodeIds, retrieval),
    grounding: retrieval.grounding,
  };
}

function extractCreativeIdeas(text: string, retrieval: RetrievalContext) {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("Creative agent returned non-JSON content");
  const parsed = JSON.parse(candidate) as Partial<CreativeIdeasResponse>;
  if (
    typeof parsed.lessonTitle !== "string" ||
    typeof parsed.solutionSummary !== "string" ||
    !Array.isArray(parsed.ideas) ||
    parsed.ideas.length < 3
  ) {
    throw new Error("Creative agent returned an incomplete response");
  }

  const ideas = parsed.ideas.slice(0, 5).map((idea, index) => {
    if (
      !idea ||
      typeof idea.title !== "string" ||
      typeof idea.approach !== "string" ||
      !Array.isArray(idea.steps) ||
      idea.steps.length < 2 ||
      typeof idea.creativeTwist !== "string" ||
      typeof idea.expectedOutcome !== "string"
    ) {
      throw new Error(`Creative agent returned an invalid idea at index ${index}`);
    }
    return {
      title: idea.title.trim(),
      approach: idea.approach.trim(),
      steps: idea.steps.filter((step): step is string => typeof step === "string" && Boolean(step.trim())).slice(0, 5),
      creativeTwist: idea.creativeTwist.trim(),
      expectedOutcome: idea.expectedOutcome.trim(),
      sourceNodeIds: assertGroundedNodeIds(idea.sourceNodeIds, retrieval),
    };
  });

  if (ideas.some((idea) => idea.steps.length < 2)) {
    throw new Error("Creative agent returned an idea without enough steps");
  }

  return {
    status: "generated" as const,
    lessonTitle: parsed.lessonTitle.trim(),
    solutionSummary: parsed.solutionSummary.trim(),
    ideas,
    sourceNodeIds: assertGroundedNodeIds(parsed.sourceNodeIds, retrieval),
  };
}

router.post("/creative/ideas", async (req, res): Promise<void> => {
  const { lesson, level, activeConcept, question, context, curriculumContext } = req.body as Record<string, unknown>;
  if (
    typeof lesson !== "string" ||
    lesson.trim().length < 2 ||
    typeof question !== "string" ||
    !question.trim() ||
    (level !== undefined && typeof level !== "string") ||
    (activeConcept !== undefined && typeof activeConcept !== "string") ||
    (context !== undefined && typeof context !== "string") ||
    (curriculumContext !== undefined && typeof curriculumContext !== "string")
  ) {
    res.status(400).json({ error: "invalid_creative_ideas_payload" });
    return;
  }

  try {
    const retrieval = await retrieveGroundedKnowledge(
      [lesson, activeConcept, question, context, curriculumContext, "كل مكتسبات المنهاج الحل والأفكار الإبداعية"].filter(
        (value): value is string => Boolean(value?.trim()),
      ).join(" "),
      { nResults: 50 },
    );
    const content = await callDeepSeekTextModel(
      [
        {
          role: "system",
          content: [
            CREATIVE_IDEAS_PROMPT,
            GROUNDED_CONTENT_RULES,
            LEARNER_SAFE_OUTPUT_RULES,
            "هذه الواجهة تحتاج JSON فقط. يجب أن تذكري الحل أولًا، ثم 3 أفكار مختلفة على الأقل، وكل فكرة يجب أن تستشهد بعقدة مسترجعة. غطّي جميع المكتسبات والمفاهيم المختلفة الموجودة في كل العقد المسترجعة، ولا تعيدي الفكرة نفسها بصيغ مختلفة.",
            'أعيدي الشكل التالي: {"lessonTitle":"...","solutionSummary":"الحل أو الفكرة المركزية خطوة خطوة","ideas":[{"title":"...","approach":"...","steps":["...","..."],"creativeTwist":"...","expectedOutcome":"...","sourceNodeIds":["node-id"]}],"sourceNodeIds":["node-id"]}',
          ].join("\n\n"),
        },
        {
          role: "user",
          content: [
            `عنوان الدرس: ${lesson}`,
            `مستوى الطالب: ${typeof level === "string" && level ? level : "3AS"}`,
            `المفهوم الحالي: ${typeof activeConcept === "string" && activeConcept ? activeConcept : "المفهوم الحالي"}`,
            `طلب الطالب: ${question}`,
            `السياق المتاح: ${typeof context === "string" && context ? context : "لا يوجد سياق إضافي"}`,
            `نطاق مكتسبات المنهاج المطلوب تغطيته: ${typeof curriculumContext === "string" && curriculumContext ? curriculumContext : "غطِّ جميع المكتسبات الموجودة في العقد المسترجعة"}`,
            "عقد المعرفة المسترجعة:",
            formatRetrievedContext(retrieval.documents),
          ].join("\n"),
        },
      ],
      { temperature: 0.35, maxOutputTokens: 2200, jsonMode: true },
    );
    const parsed = extractCreativeIdeas(content, retrieval);
    res.json({
      ...parsed,
      sourceDocuments: sourceDocumentsFrom(retrieval.documents),
      grounding: retrieval.grounding,
    } satisfies CreativeIdeasResponse);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    req.log.error({ error: errorMessage }, "Creative ideas generation failed");
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "creative_ideas_generation_failed",
      message: error instanceof KnowledgeGroundingError
        ? "لا يمكن توليد أفكار موثوقة قبل نجاح استرجاع مصادر المنهاج."
        : "تعذر توليد الحل والأفكار الإبداعية الآن. أعد المحاولة بعد قليل.",
    });
  }
});

router.post("/creative/exam-topic", async (req, res): Promise<void> => {
  const { subject, level, track, request } = req.body as Record<string, unknown>;
  if (
    typeof subject !== "string" ||
    subject.trim().length < 2 ||
    (level !== undefined && typeof level !== "string") ||
    (track !== undefined && typeof track !== "string") ||
    (request !== undefined && typeof request !== "string")
  ) {
    res.status(400).json({ error: "invalid_exam_topic_payload" });
    return;
  }
  try {
    const retrieval = await retrieveGroundedKnowledge(
      [
        subject,
        typeof level === "string" ? level : "السنة الثالثة ثانوي",
        typeof track === "string" ? track : "شعبة العلوم التجريبية",
        typeof request === "string" ? request : "",
        "موضوع بكالوريا كامل تمارين إبداعية وتصحيح نموذجي سلم تنقيط",
      ].filter(Boolean).join(" "),
      { nResults: 24 },
    );
    const content = await callDeepSeekTextModel(
      [
        {
          role: "system",
          content: [
            ACADEMIC_EXAM_PROMPT,
            EXERCISE_GENERATION_PROMPT,
            GROUNDED_CONTENT_RULES,
            LEARNER_SAFE_OUTPUT_RULES,
            "أنشئ ورقة موضوع كاملة بالعربية، جديدة وغير تكرارية، لمستوى التعليم الثانوي الجزائري. التزم بالمكتسبات الموجودة في عقد المعرفة فقط، ولا تخترع قانونًا أو قيمة أو نتيجة غير مسندة. اجعلها 3 تمارين مترابطة في الصعوبة، مجموعها 20 نقطة، وكل تمرين يحتوي على سياق ومعطيات ومطلوبات قابلة للتحقق. أضف دليل تصحيح مطابقًا لكل تمرين: خطوات حل كاملة ومعايير تنقيط مجموعها يساوي نقاط التمرين. لا تكتب أي نص خارج JSON.",
            'أعد الشكل: {"title":"...","subject":"...","track":"...","grade":"...","duration":"ساعتان و30 دقيقة","totalPoints":20,"instructions":["..."],"sections":[{"id":"section-1","title":"...","points":6,"theme":"...","context":"...","data":"...","questions":[{"id":"q1","label":"أ","prompt":"...","points":2}]}],"correction":{"title":"شبكة التصحيح النموذجي","introduction":"...","sections":[{"sectionId":"section-1","title":"تصحيح التمرين الأول","solutionSteps":["...","..."],"criteria":[{"label":"...","points":2}]}]},"sourceNodeIds":["node-id"]}',
          ].join("\n\n"),
        },
        {
          role: "user",
          content: [
            `المادة: ${subject}`,
            `المستوى: ${typeof level === "string" && level ? level : "السنة الثالثة ثانوي"}`,
            `الشعبة: ${typeof track === "string" && track ? track : "شعبة العلوم التجريبية"}`,
            `طلب التوليد: ${typeof request === "string" && request ? request : "موضوع شامل وفق المنهاج"}`,
            "عقد المعرفة المسترجعة من ChromaDB:",
            formatRetrievedContext(retrieval.documents),
          ].join("\n"),
        },
      ],
      { temperature: 0.4, maxOutputTokens: 5200, jsonMode: true },
    );
    res.json(parseGeneratedExam(content, retrieval));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    req.log.error({ error: errorMessage }, "Grounded exam generation failed");
    res.status(error instanceof KnowledgeGroundingError ? 424 : 502).json({
      error: error instanceof KnowledgeGroundingError ? error.code : "exam_generation_failed",
      message: errorMessage.includes("DEEPSEEK_API_KEY")
        ? "لم يتم إعداد مزود الذكاء الاصطناعي بعد."
        : error instanceof KnowledgeGroundingError
          ? "لا يمكن اعتماد موضوع قبل نجاح استرجاع مصادر المنهاج."
          : "تعذر توليد الموضوع ودليل التصحيح من المصادر حاليًا. أعد المحاولة.",
    });
  }
});

export default router;