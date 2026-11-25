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

const performanceRow = {
  /** Open jobs right now (assigned, in progress or waiting for verification). */
  open: z.number().int(),
  /** Open jobs past their SLA deadline right now. */
  overdue: z.number().int(),
  /** Jobs verified as repaired within the period. */
  resolved: z.number().int(),
  resolvedWithinSla: z.number().int(),
  /** Average hours from report to finished repair for `resolved`; null when none. */
  averageRepairHours: z.number().nullable(),
};

/** Detailed tables behind the Reports page (same period rules as the summary). */
export const reportBreakdownSchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    /** `day` for periods up to 90 days, `month` for a year. Dates are India time. */
    bucket: z.enum(['day', 'month']),
    trend: z.array(
      z.object({
        /** First day of the bucket, `YYYY-MM-DD` (Asia/Kolkata). */
        date: z.string(),
        workOrdersCreated: z.number().int(),
        workOrdersResolved: z.number().int(),
        complaints: z.number().int(),
        /** Measured by controllers; energy that crosses a bucket boundary is not counted. */
        energyKWh: z.number(),
      }),
    ),
    faults: z.array(z.object({ faultType: z.string(), count: z.number().int() })),
    wards: z.array(
      z.object({
        /** Ward record id; null for legacy text wards or poles without a ward. */
        wardId: z.uuid().nullable(),
        code: z.string().nullable(),
        /** Ward name, legacy ward text, or null for poles without a ward. */
        name: z.string().nullable(),
        poles: z.number().int(),
        working: z.number().int(),
        faulty: z.number().int(),
        offline: z.number().int(),
        workOrdersCreated: z.number().int(),
        ...performanceRow,
      }),
    ),
    technicians: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        agency: z.string().nullable(),
        ...performanceRow,
      }),
    ),
    agencies: z.array(z.object({ id: z.uuid(), name: z.string(), ...performanceRow })),
    /** Controllers that reported energy in the period, and how many of them are simulated. */
    dataSources: z.object({
      controllersReporting: z.number().int(),
      simulatedControllersReporting: z.number().int(),
    }),
  })
  .meta({ id: 'ReportBreakdown' });

export type ReportBreakdownDto = z.infer<typeof reportBreakdownSchema>;
