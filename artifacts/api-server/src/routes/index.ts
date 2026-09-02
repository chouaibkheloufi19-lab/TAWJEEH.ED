import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import healthRouter from "./health";
import learningRouter from "./learning";
import knowledgeRouter from "./knowledge";
import quizzesRouter from "./quizzes";
import fahimRouter from "./fahim";
import lessonRouter from "./lesson";

const router: IRouter = Router();

router.use(healthRouter);
router.use((req: Request, res: Response, next: NextFunction): void => {
  const auth = getAuth(req);
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
router.use(lessonRouter);

export default router;
