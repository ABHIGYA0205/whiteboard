import { Router } from "express";
import {
  cleanBoardController,
  createBoardController,
  getBoardController,
  updateBoardController
} from "../controllers/board.controller";

export const boardRouter = Router();

boardRouter.post("/", createBoardController);
boardRouter.post("/clean", cleanBoardController);
boardRouter.get("/:id", getBoardController);
boardRouter.put("/:id", updateBoardController);
