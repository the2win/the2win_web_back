import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // Normalize error
  let status = 500;
  let message = 'Internal Server Error';

  // Map Zod validation to 400
  if (err instanceof ZodError) {
    status = 400;
    message = err.issues?.[0]?.message || 'Invalid request';
  } else if (typeof err === 'string') {
    message = err;
  } else if (err && typeof err.message === 'string') {
    message = err.message;
  }

  if (typeof (err?.status) === 'number') status = err.status;
  if (typeof (err?.code) === 'string' && err.code === 'ER_DUP_ENTRY') status = 409;

  // Log detailed error on server only
  console.error('[errorHandler]', { status, message, stack: err?.stack, debug: err?.debug });
  const payload: any = { message };
  if ((process.env.AUTH_DEBUG || '').toLowerCase() === 'true' && err?.debug) {
    payload.debug = err.debug;
  }
  res.status(status).json(payload);
}
