"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBoard = createBoard;
exports.getBoard = getBoard;
exports.updateBoard = updateBoard;
const crypto_1 = require("crypto");
const Board_1 = require("../models/Board");
async function createBoard(id = (0, crypto_1.randomUUID)()) {
    const existing = await Board_1.BoardModel.findOne({ id }).lean();
    if (existing) {
        return existing;
    }
    const board = await Board_1.BoardModel.create({
        id,
        elements: []
    });
    return board.toObject();
}
async function getBoard(id) {
    return Board_1.BoardModel.findOne({ id }).lean();
}
async function updateBoard(id, elements) {
    const board = await Board_1.BoardModel.findOneAndUpdate({ id }, { $set: { elements } }, { new: true, upsert: true }).lean();
    if (!board) {
        throw new Error("Board could not be updated.");
    }
    return board;
}
