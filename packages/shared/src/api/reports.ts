import { z } from 'zod';

/** Reporting periods offered to municipalities (days back from now). */
export const REPORT_PERIODS = [7, 30, 90, 365] as const;

export const reportQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => (REPORT_PERIODS as readonly number[]).includes(value), {
      error: 'Use 7, 30, 90 or 365',
    })
    .default(30),
  tenantId: z.uuid().optional(),
});

export const reportSummarySchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    workOrders: z.object({
      created: z.number().int(),
      resolved: z.number().int(),
      /** Resolved jobs whose repair was finished before the SLA deadline. */
      resolvedWithinSla: z.number().int(),
      /** Share of resolved jobs repaired within the SLA (0–1); null when nothing resolved. */
      slaCompliance: z.number().nullable(),
      /** Average hours from report to finished repair; null when nothing resolved. */
      averageRepairHours: z.number().nullable(),
      openNow: z.number().int(),
      overdueNow: z.number().int(),
      bySource: z.object({
        IOT_ALERT: z.number().int(),
        CITIZEN_COMPLAINT: z.number().int(),
        INSPECTION: z.number().int(),
        MANUAL: z.number().int(),
      }),
    }),
    complaints: z.object({ received: z.number().int(), resolved: z.number().int() }),
    energy: z.object({
      /** Measured by the controllers over the period. */
      kWh: z.number(),
      controllersReporting: z.number().int(),
    }),
    poles: z.object({
      total: z.number().int(),
      workingNow: z.number().int(),
      controllersOnline: z.number().int(),
      controllers: z.number().int(),
    }),
  })
  .meta({ id: 'ReportSummary' });

export type ReportSummaryDto = z.infer<typeof reportSummarySchema>;
