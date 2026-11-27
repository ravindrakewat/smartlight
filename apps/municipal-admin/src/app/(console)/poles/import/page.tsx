'use client';

import {
  ApiClientError,
  POLE_IMPORT_MAX_ROWS,
  type ImportPoleRow,
  type ImportPolesResult,
} from '@smart-light/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@smart-light/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, Printer } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState, type ChangeEvent } from 'react';
import { ZonesCard } from '@/components/ZonesCard';
import { api } from '@/lib/api';
import { LAST_IMPORT_STORAGE_KEY } from '@/lib/plates';
import {
  columnForField,
  parsePoleCsv,
  POLE_CSV_TEMPLATE,
  type ParsedPoleCsv,
  type PoleCsvProblem,
} from '@/lib/pole-csv';

type Phase = 'idle' | 'checking' | 'importing' | 'done';

interface ServerProblem {
  line: number;
  column: ReturnType<typeof columnForField>;
}

const MAX_LISTED_PROBLEMS = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export default function PoleImportPage() {
  const t = useTranslations('PoleImport');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const fileInputId = useId();

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedPoleCsv | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [serverProblems, setServerProblems] = useState<ServerProblem[]>([]);
  const [failure, setFailure] = useState<'generic' | 'partial' | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  function downloadTemplate() {
    const blob = new Blob([String.fromCharCode(0xfeff), POLE_CSV_TEMPLATE], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'poles-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPhase('idle');
    setServerProblems([]);
    setFailure(null);
    setImportedCount(0);
    if (!file) {
      setParsed(null);
      setFileName(null);
      return;
    }
    setFileName(file.name);
    setParsed(parsePoleCsv(await file.text()));
  }

  /** Maps `rows.<i>.<field>` from a batch response back to file lines. */
  function toServerProblems(error: unknown, lines: number[]): ServerProblem[] {
    if (!(error instanceof ApiClientError) || error.code !== 'IMPORT_INVALID') {
      return [];
    }
    return (error.details ?? []).flatMap((detail) => {
      const match = /^rows\.(\d+)\.(\w+)$/.exec(detail.field ?? '');
      const line = match ? lines[Number(match[1])] : undefined;
      return line ? [{ line, column: columnForField(match?.[2]) }] : [];
    });
  }

  async function runImport() {
    if (!parsed) {
      return;
    }
    const rowBatches = chunk<ImportPoleRow>(parsed.rows, POLE_IMPORT_MAX_ROWS);
    const lineBatches = chunk(parsed.lines, POLE_IMPORT_MAX_ROWS);
    setServerProblems([]);
    setFailure(null);

    // 1. Check every batch before saving any, so a large file is all-or-nothing
    //    in the common case (bad zone code, already imported).
    setPhase('checking');
    for (const [index, rows] of rowBatches.entries()) {
      setProgress({ done: index * POLE_IMPORT_MAX_ROWS, total: parsed.rows.length });
      try {
        await api.request('/v1/poles/import', {
          method: 'POST',
          query: { dryRun: 'true' },
          body: { rows },
        });
      } catch (error) {
        const problems = toServerProblems(error, lineBatches[index] ?? []);
        setServerProblems(problems);
        setFailure(problems.length > 0 ? null : 'generic');
        setPhase('idle');
        return;
      }
    }

    // 2. Save batch by batch.
    setPhase('importing');
    const codes: string[] = [];
    for (const [index, rows] of rowBatches.entries()) {
      setProgress({ done: codes.length, total: parsed.rows.length });
      try {
        const result = await api.request<ImportPolesResult>('/v1/poles/import', {
          method: 'POST',
          body: { rows },
        });
        codes.push(...result.poles.map((pole) => pole.code));
      } catch (error) {
        setServerProblems(toServerProblems(error, lineBatches[index] ?? []));
        setFailure(codes.length > 0 ? 'partial' : 'generic');
        break;
      }
    }

    setImportedCount(codes.length);
    if (codes.length > 0) {
      try {
        sessionStorage.setItem(LAST_IMPORT_STORAGE_KEY, JSON.stringify(codes));
      } catch {
        // Storage can be unavailable (private mode); printing by zone still works.
      }
      void queryClient.invalidateQueries({ queryKey: ['poles'] });
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
    }
    setPhase(codes.length === parsed.rows.length ? 'done' : 'idle');
  }

  const fileProblems: PoleCsvProblem[] = parsed?.problems ?? [];
  const busy = phase === 'checking' || phase === 'importing';
  const canImport =
    parsed !== null &&
    parsed.missingColumns.length === 0 &&
    parsed.rows.length > 0 &&
    fileProblems.length === 0 &&
    serverProblems.length === 0 &&
    !busy &&
    phase !== 'done';

  const problemText = (problem: {
    line: number;
    column: string;
    kind?: string;
    otherLine?: number;
  }) =>
    problem.kind === 'duplicateInFile'
      ? t('problems.duplicateInFile', { line: problem.line, other: problem.otherLine ?? 0 })
      : problem.kind === 'invalid'
        ? t('problems.invalid', {
            line: problem.line,
            column: t(`columns.${problem.column as 'row'}`),
          })
        : problem.column === 'zone'
          ? t('problems.unknownZone', { line: problem.line })
          : problem.column === 'latitude'
            ? t('problems.exists', { line: problem.line })
            : t('problems.invalid', {
                line: problem.line,
                column: t(`columns.${problem.column as 'row'}`),
              });

  const listed = [...fileProblems, ...serverProblems];

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button asChild variant="secondary">
            <Link href="/poles">{t('back')}</Link>
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid content-start gap-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('steps.title')}</CardTitle>
              <CardDescription>
                {t('steps.description', { max: POLE_IMPORT_MAX_ROWS })}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <ol className="grid list-decimal gap-2 pl-5 text-sm">
                <li>{t('steps.one')}</li>
                <li>{t('steps.two')}</li>
                <li>{t('steps.three')}</li>
              </ol>

              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={downloadTemplate}>
                  <Download aria-hidden="true" />
                  {t('template')}
                </Button>
                <div>
                  <label
                    htmlFor={fileInputId}
                    className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-subtle focus-within:outline-2 focus-within:outline-ring [&_svg]:size-4"
                  >
                    <FileUp aria-hidden="true" />
                    {fileName ?? t('chooseFile')}
                  </label>
                  <input
                    id={fileInputId}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    disabled={busy}
                    onChange={(event) => void onFile(event)}
                  />
                </div>
              </div>

              {parsed && parsed.missingColumns.length > 0 ? (
                <Alert tone="danger">
                  {t('missingColumns', { columns: parsed.missingColumns.join(', ') })}
                </Alert>
              ) : null}

              {parsed && parsed.missingColumns.length === 0 ? (
                <p className="text-sm" aria-live="polite">
                  {t('summary', {
                    valid: format.number(parsed.rows.length),
                    problems: format.number(fileProblems.length),
                  })}
                </p>
              ) : null}

              {listed.length > 0 ? (
                <Alert tone="danger" title={t('problems.title')}>
                  <ul className="mt-1 grid gap-0.5">
                    {listed.slice(0, MAX_LISTED_PROBLEMS).map((problem, index) => (
                      <li key={`${problem.line}-${problem.column}-${index}`}>
                        {problemText(problem)}
                      </li>
                    ))}
                  </ul>
                  {listed.length > MAX_LISTED_PROBLEMS ? (
                    <p className="mt-1">
                      {t('problems.more', { count: listed.length - MAX_LISTED_PROBLEMS })}
                    </p>
                  ) : null}
                  <p className="mt-2">{t('problems.nothingSaved')}</p>
                </Alert>
              ) : null}

              {failure === 'generic' ? <Alert tone="danger">{t('failed')}</Alert> : null}
              {failure === 'partial' ? (
                <Alert tone="warning">
                  {t('partial', {
                    done: format.number(importedCount),
                    total: format.number(parsed?.rows.length ?? 0),
                  })}
                </Alert>
              ) : null}

              {busy ? (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {t(phase === 'checking' ? 'checking' : 'importing', {
                    done: format.number(progress.done),
                    total: format.number(progress.total),
                  })}
                </p>
              ) : null}

              {phase === 'done' ? (
                <Alert tone="success" title={t('done.title', { count: importedCount })}>
                  <p>{t('done.body')}</p>
                  <Button asChild className="mt-3">
                    <Link href="/print/poles?source=import">
                      <Printer aria-hidden="true" />
                      {t('done.print')}
                    </Link>
                  </Button>
                </Alert>
              ) : (
                <div>
                  <Button disabled={!canImport} onClick={() => void runImport()}>
                    {t('import', { count: parsed?.rows.length ?? 0 })}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {parsed && parsed.rows.length > 0 ? (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>{t('preview')}</CardTitle>
              </CardHeader>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="bg-surface-subtle/60 text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-2 font-medium">
                        {t('columns.line')}
                      </th>
                      {(
                        ['latitude', 'longitude', 'zone', 'address', 'ward', 'wattage'] as const
                      ).map((column) => (
                        <th key={column} scope="col" className="px-3 py-2 font-medium">
                          {t(`columns.${column}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsed.rows.slice(0, 5).map((row, index) => (
                      <tr key={parsed.lines[index]}>
                        <th scope="row" className="px-5 py-2 font-normal tabular-nums">
                          {parsed.lines[index]}
                        </th>
                        <td className="px-3 py-2 tabular-nums">{row.latitude}</td>
                        <td className="px-3 py-2 tabular-nums">{row.longitude}</td>
                        <td className="px-3 py-2 font-mono">{row.zoneCode ?? '—'}</td>
                        <td className="px-3 py-2">{row.address ?? '—'}</td>
                        <td className="px-3 py-2">{row.ward ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums">{row.wattage ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>

        <ZonesCard />
      </div>
    </>
  );
}
