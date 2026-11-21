import { z } from 'zod';

/** Zod versions of the response envelopes, used for OpenAPI docs and client-side parsing. */

export const responseMetaSchema = z
  .object({
    timestamp: z.iso.datetime(),
    requestId: z.string().optional(),
  })
  .meta({ id: 'ResponseMeta' });

export const apiErrorSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.string().meta({ example: 'VALIDATION_ERROR' }),
      message: z.string(),
      details: z.array(z.object({ field: z.string().optional(), message: z.string() })).optional(),
    }),
    meta: responseMetaSchema,
  })
  .meta({ id: 'ApiError' });

export function successEnvelope<TData extends z.ZodType>(data: TData) {
  return z.object({
    success: z.literal(true),
    data,
    meta: responseMetaSchema.optional(),
  });
}

export const paginationMetaSchema = z
  .object({
    page: z.number().int(),
    pageSize: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
  })
  .meta({ id: 'PaginationMeta' });

export function paginatedEnvelope<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    success: z.literal(true),
    data: z.array(item),
    meta: responseMetaSchema.extend({ pagination: paginationMetaSchema }),
  });
}
