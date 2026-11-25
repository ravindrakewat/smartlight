import { z } from 'zod';

export const sparePartSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    nameHi: z.string().nullable(),
    unit: z.string(),
    stockQty: z.number().int(),
    minStock: z.number().int(),
    /** Stock at or below the reorder level. */
    lowStock: z.boolean(),
    active: z.boolean(),
    /** Quantity used on repairs in the last 30 days. */
    usedLast30Days: z.number().int(),
  })
  .meta({ id: 'SparePart' });
export type SparePartDto = z.infer<typeof sparePartSchema>;

export const listSparePartsQuerySchema = z.object({
  /** Include parts that are no longer stocked. */
  all: z.stringbool().optional(),
  tenantId: z.uuid().optional(),
});

export const createSparePartSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(30)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, { error: 'Letters, digits, . _ / -' })
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(2).max(120),
    nameHi: z.string().trim().max(120).optional(),
    unit: z.string().trim().min(1).max(10).default('pcs'),
    minStock: z.number().int().min(0).max(100_000).default(0),
    /** Opening stock, recorded as a RECEIVED movement. */
    openingStock: z.number().int().min(0).max(100_000).default(0),
  })
  .meta({ id: 'CreateSparePartRequest' });

export const updateSparePartSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    nameHi: z.string().trim().max(120).nullable().optional(),
    unit: z.string().trim().min(1).max(10).optional(),
    minStock: z.number().int().min(0).max(100_000).optional(),
    active: z.boolean().optional(),
  })
  .meta({ id: 'UpdateSparePartRequest' });

export const stockMovementInputSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('RECEIVED'),
      quantity: z.number().int().min(1).max(100_000),
      note: z.string().trim().max(300).optional(),
    }),
    z.object({
      kind: z.literal('ADJUSTED'),
      quantity: z
        .number()
        .int()
        .min(-100_000)
        .max(100_000)
        .refine((value) => value !== 0, { error: 'Enter a non-zero correction' }),
      /** Corrections must say why. */
      note: z.string().trim().min(3).max(300),
    }),
  ])
  .meta({ id: 'StockMovementRequest' });

export const stockMovementSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['RECEIVED', 'USED', 'ADJUSTED']),
    quantity: z.number().int(),
    note: z.string().nullable(),
    workOrderNumber: z.string().nullable(),
    actorName: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'StockMovement' });
export type StockMovementDto = z.infer<typeof stockMovementSchema>;
