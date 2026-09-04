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
  CREATIVE_IDEAS_PROMPT,
  GROUNDED_CONTENT_RULES,
  LEARNER_SAFE_OUTPUT_RULES,
} from "../lib/ai-prompts";
import { callXaiTextModel } from "../lib/ai-provider";

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
    const content = await callXaiTextModel(
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
      { temperature: 0.35, maxOutputTokens: 2200 },
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

export default router;