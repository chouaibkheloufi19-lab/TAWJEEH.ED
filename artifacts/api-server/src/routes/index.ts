import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import healthRouter from "./health";
import learningRouter from "./learning";
import knowledgeRouter from "./knowledge";
import quizzesRouter from "./quizzes";
<<<<<<< HEAD
<<<<<<< HEAD
import fahimRouter from "./fahim";
=======
>>>>>>> origin/main
=======
import fahimRouter from "./fahim";
>>>>>>> 9685650 (Update api server configuration and regenerate client schemas)

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
<<<<<<< HEAD
<<<<<<< HEAD
router.use(fahimRouter);
=======
>>>>>>> origin/main
=======
router.use(fahimRouter);
>>>>>>> 9685650 (Update api server configuration and regenerate client schemas)

export default router;
