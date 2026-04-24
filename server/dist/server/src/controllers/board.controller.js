"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBoardController = createBoardController;
exports.getBoardController = getBoardController;
exports.updateBoardController = updateBoardController;
exports.cleanBoardController = cleanBoardController;
const ai_service_1 = require("../services/ai.service");
const board_service_1 = require("../services/board.service");
function getParamId(value) {
    if (Array.isArray(value)) {
        return value[0] ?? "";
    }
    return value ?? "";
}
async function createBoardController(_request, response) {
    try {
        const board = await (0, board_service_1.createBoard)();
        response.status(201).json(board);
    }
    catch (error) {
        response.status(500).json({
            message: error instanceof Error ? error.message : "Failed to create board."
        });
    }
}
async function getBoardController(request, response) {
    try {
        const boardId = getParamId(request.params.id);
        const board = await (0, board_service_1.getBoard)(boardId);
        if (!board) {
            const created = await (0, board_service_1.createBoard)(boardId);
            response.json(created);
            return;
        }
        response.json(board);
    }
    catch (error) {
        response.status(500).json({
            message: error instanceof Error ? error.message : "Failed to load board."
        });
    }
}
async function updateBoardController(request, response) {
    try {
        const board = await (0, board_service_1.updateBoard)(getParamId(request.params.id), request.body.elements ?? []);
        response.json(board);
    }
    catch (error) {
        response.status(500).json({
            message: error instanceof Error ? error.message : "Failed to update board."
        });
    }
}
async function cleanBoardController(request, response) {
    try {
        const elements = (0, ai_service_1.autoCleanElements)(request.body.elements ?? []);
        response.json({ elements });
    }
    catch (error) {
        response.status(500).json({
            message: error instanceof Error ? error.message : "Failed to clean elements."
        });
    }
}
