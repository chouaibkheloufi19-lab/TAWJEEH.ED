import { Router, type IRouter } from "express";
import { GetOrchestratorStateResponse } from "@workspace/api-zod";
import { getUserId, getOrchestratorState } from "../lib/learning-store";

const router: IRouter = Router();

router.get("/orchestrator/state", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const state = await getOrchestratorState(userId, {
    currentDate: typeof req.query.current_date === "string" ? req.query.current_date : undefined,
    entryDate: typeof req.query.entry_date === "string" ? req.query.entry_date : undefined,
    subjectName: typeof req.query.subject_name === "string" ? req.query.subject_name : undefined,
    prerequisiteSkill: typeof req.query.prerequisite_skill === "string"
      ? req.query.prerequisite_skill
      : undefined,
  });
  res.json(GetOrchestratorStateResponse.parse(state));
});

export default router;