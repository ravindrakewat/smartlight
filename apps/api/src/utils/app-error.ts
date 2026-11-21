import type { ApiErrorDetail } from '@smart-light/shared';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ApiErrorDetail[];
  public readonly isOperational: boolean;

  constructor(options: {
    message: string;
    statusCode: number;
    code: string;
    details?: ApiErrorDetail[];
    isOperational?: boolean;
  }) {
    super(options.message);
    this.name = 'AppError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
