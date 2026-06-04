import { Response } from "express";

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  res.status(status).json({ error: { code, message, details: details ?? {} } });
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  status = 200,
  meta?: Record<string, unknown>,
): void {
  res.status(status).json({ data, meta: meta ?? {} });
}
