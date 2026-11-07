import crypto from "crypto";
import { env } from "./env";

export type BoardRole = "owner" | "editor" | "viewer";

export interface BoardTokenPayload {
  boardId: string;
  role: BoardRole;
  exp: number; // unix timestamp in seconds
}

export function signBoardToken(
  boardId: string,
  role: BoardRole,
  ttlHours: number = 168
): string {
  const secret = env.boardSecret;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.round(ttlHours * 3600);
  const payload: BoardTokenPayload = { boardId, role, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  const sigB64 = hmac.toString("base64url");
  return `${payloadB64}.${sigB64}`;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyBoardToken(
  token: string,
  targetBoardId: string
): { valid: true; payload: BoardTokenPayload } | { valid: false; reason: "INVALID" | "EXPIRED" } {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "INVALID" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "INVALID" };
  }

  const [payloadB64, sigB64] = parts;
  const secret = env.boardSecret;

  try {
    const expectedHmac = crypto.createHmac("sha256", secret).update(payloadB64).digest();
    const receivedSig = Buffer.from(sigB64, "base64url");

    if (receivedSig.length !== expectedHmac.length) {
      return { valid: false, reason: "INVALID" };
    }

    if (!crypto.timingSafeEqual(receivedSig, expectedHmac)) {
      return { valid: false, reason: "INVALID" };
    }

    const payloadRaw = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadRaw) as BoardTokenPayload;

    if (!payload || typeof payload !== "object") {
      return { valid: false, reason: "INVALID" };
    }

    if (payload.boardId !== targetBoardId) {
      return { valid: false, reason: "INVALID" };
    }

    if (!["owner", "editor", "viewer"].includes(payload.role)) {
      return { valid: false, reason: "INVALID" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= now) {
      return { valid: false, reason: "EXPIRED" };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "INVALID" };
  }
}
