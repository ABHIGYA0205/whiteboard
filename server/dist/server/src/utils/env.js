"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const defaultOrigins = [
    "http://localhost:3000",
    "http://localhost:3001"
];
const configuredOrigins = (process.env.CLIENT_ORIGIN ?? defaultOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
exports.env = {
    port: Number(process.env.PORT ?? 4001),
    mongoUri: process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/ai-whiteboard",
    clientOrigins: configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins
};
