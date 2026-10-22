import { Router } from "express";
import {
  cleanBoardController,
  createBoardController,
  getBoardController,
  updateBoardController,
  deleteBoardController,
  applyBoardOpsController,
  uploadImageController
} from "../controllers/board.controller";
import { rateLimiter } from "../middlewares/rateLimiter";

export const boardRouter = Router();

const generalLimiter = rateLimiter({ windowMs: 60 * 1000, max: 120 });
const createLimiter = rateLimiter({ windowMs: 60 * 1000, max: 20, message: "Too many boards created. Please wait." });

boardRouter.use(generalLimiter);

boardRouter.post("/", createLimiter, createBoardController);
boardRouter.post("/clean", cleanBoardController);
boardRouter.post("/upload", uploadImageController);
boardRouter.get("/:id", getBoardController);
boardRouter.put("/:id", updateBoardController);
boardRouter.delete("/:id", deleteBoardController);
boardRouter.post("/:id/ops", applyBoardOpsController);
