import { Router, type IRouter } from "express";
import healthRouter from "./health";
import learningRouter from "./learning";
import knowledgeRouter from "./knowledge";
import quizzesRouter from "./quizzes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(learningRouter);
router.use(knowledgeRouter);
router.use(quizzesRouter);

export default router;
