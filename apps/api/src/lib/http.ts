import type { ApiSuccessResponse, PaginationMeta } from '@smart-light/shared';
import type { Request, Response } from 'express';

export function requestIdOf(res: Response): string | undefined {
  return typeof res.locals.requestId === 'string' ? res.locals.requestId : undefined;
}

/** Sends the standard success envelope. */
export function sendData<TData>(res: Response, data: TData, status = 200): void {
  const payload: ApiSuccessResponse<TData> = {
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), requestId: requestIdOf(res) },
  };
  res.status(status).json(payload);
}

export function sendPage<TItem>(res: Response, items: TItem[], pagination: PaginationMeta): void {
  const payload: ApiSuccessResponse<TItem[]> = {
    success: true,
    data: items,
    meta: { timestamp: new Date().toISOString(), requestId: requestIdOf(res), pagination },
  };
  res.status(200).json(payload);
}

/** Client metadata recorded on sessions and audit entries. */
export function clientInfo(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
  };
}
