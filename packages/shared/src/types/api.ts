import type { IsoTimestamp, PaginationMeta } from './common';

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiSuccessResponse<TData> {
  success: true;
  data: TData;
  meta?: {
    timestamp: IsoTimestamp;
    requestId?: string;
    pagination?: PaginationMeta;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
  meta: {
    timestamp: IsoTimestamp;
    requestId?: string;
  };
}

export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;
