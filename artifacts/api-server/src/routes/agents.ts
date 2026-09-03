import { Router, type IRouter } from "express";
import {
  KnowledgeGroundingError,
  provisionLearningAgents,
} from "../lib/rag";

const router: IRouter = Router();

router.get("/agents/readiness", async (req, res): Promise<void> => {
  try {
    const readiness = await provisionLearningAgents();
    res.json(readiness);
  } catch (error) {
    req.log.error({ error }, "Agent provisioning failed");
    res.status(error instanceof KnowledgeGroundingError ? 424 : 503).json({
      status: "blocked",
      error: error instanceof KnowledgeGroundingError
        ? error.code
        : "knowledge_service_unavailable",
      message: "لا تتوفر مواد الدرس الآن. أعد المحاولة بعد قليل.",
    });
  }
});

export default router;