import { Router } from "express";
import {
  cleanBoardController,
  createBoardController,
  renameBoardController,
  getBoardController,
  updateBoardController,
  deleteBoardController,
  applyBoardOpsController,
  uploadImageController,
  claimBoardController,
  shareBoardController
} from "../controllers/board.controller";
import { rateLimiter } from "../middlewares/rateLimiter";

export const boardRouter = Router();
boardRouter.use((_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});

const generalLimiter = rateLimiter({ windowMs: 60 * 1000, max: 120 });
const createLimiter = rateLimiter({ windowMs: 60 * 1000, max: 20, message: "Too many boards created. Please wait." });

// Autosave batches have their own allowance because editors on the same
// network can share an IP address.
const autosaveLimiter = rateLimiter({ windowMs: 60 * 1000, max: 900 });
boardRouter.post("/:id/ops", autosaveLimiter, applyBoardOpsController);
boardRouter.use(generalLimiter);

boardRouter.post("/", createLimiter, createBoardController);
boardRouter.post("/clean", cleanBoardController);
boardRouter.post("/upload", uploadImageController);
boardRouter.post("/:id/claim", claimBoardController);
boardRouter.post("/:id/share", shareBoardController);
boardRouter.get("/:id", getBoardController);
boardRouter.patch("/:id", renameBoardController);
boardRouter.put("/:id", updateBoardController);
boardRouter.delete("/:id", deleteBoardController);
