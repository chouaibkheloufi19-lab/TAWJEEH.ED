import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import healthRouter from "./health";
import learningRouter from "./learning";
import knowledgeRouter, { knowledgeStatusRouter } from "./knowledge";
import quizzesRouter from "./quizzes";
import fahimRouter from "./fahim";
import lessonRouter from "./lesson";
import agentsRouter from "./agents";
import creativeRouter from "./creative";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(knowledgeStatusRouter);
router.use(agentsRouter);
router.use((req: Request, res: Response, next: NextFunction): void => {
  const auth = process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY
    ? getAuth(req)
    : (req as Request & {
        auth?: () => { userId?: string; sessionClaims?: { userId?: string } };
      }).auth?.();
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});
router.use(learningRouter);
router.use(knowledgeRouter);
router.use(quizzesRouter);
router.use(fahimRouter);
router.use(creativeRouter);
router.use(lessonRouter);
router.use(aiRouter);

export default router;
