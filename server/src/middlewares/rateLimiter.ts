import type { Request, Response, NextFunction } from "express";

type RateLimiterOptions = {
  windowMs: number;
  max: number;
  message?: string;
};

export function rateLimiter(options: RateLimiterOptions) {
  const ipStore = new Map<string, { count: number; resetAt: number }>();

  // Cleanup old records periodically
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipStore.entries()) {
      if (now > entry.resetAt) {
        ipStore.delete(ip);
      }
    }
  }, options.windowMs * 2);

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "anonymous";
    const now = Date.now();
    const entry = ipStore.get(ip);

    if (!entry || now > entry.resetAt) {
      ipStore.set(ip, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (entry.count >= options.max) {
      return res.status(429).json({
        error: options.message || "Too many requests. Please slow down."
      });
    }

    entry.count += 1;
    next();
  };
}
