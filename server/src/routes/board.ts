import { Router } from "express";
import {
  cleanBoardController,
  createBoardController,
  getBoardController,
  updateBoardController,
  applyBoardOpsController,
  uploadImageController
} from "../controllers/board.controller";

export const boardRouter = Router();

boardRouter.post("/", createBoardController);
boardRouter.post("/clean", cleanBoardController);
boardRouter.post("/upload", uploadImageController);
boardRouter.get("/:id", getBoardController);
boardRouter.put("/:id", updateBoardController);
boardRouter.post("/:id/ops", applyBoardOpsController);
