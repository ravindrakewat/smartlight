'use client';

import type { PoleDto, ZoneDto } from '@smart-light/shared';
import { Alert, Button, Field, Select, Skeleton } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import { QrCode } from '@/components/QrCode';
import { useSessionUser } from '@/components/Session';
import { api } from '@/lib/api';
import {
  LAST_IMPORT_STORAGE_KEY,
  MAX_PLATES_PER_PRINT,
  plateUrl,
  portalHost,
  portalMisconfigured,
} from '@/lib/plates';

/** `import` = codes from the last import in this tab; `all`; or a zone id. */
type Source = 'import' | 'all' | `zone:${string}`;

function readLastImport(): string[] {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(LAST_IMPORT_STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((code) => typeof code === 'string') : [];
  } catch {
    return [];
  }
}

async function fetchCodes(zoneId?: string): Promise<{ codes: string[]; truncated: boolean }> {
  const codes: string[] = [];
  for (let page = 1; codes.length < MAX_PLATES_PER_PRINT; page++) {
    const result = await api.page<PoleDto>('/v1/poles', {
      query: { page, pageSize: 100, ...(zoneId ? { zoneId } : {}) },
    });
    codes.push(...result.items.map((pole) => pole.code));
    if (page >= result.pagination.totalPages) {
      return { codes, truncated: false };
    }
  }
  return { codes: codes.slice(0, MAX_PLATES_PER_PRINT), truncated: true };
}

function Plate({ code, cityHi, city }: { code: string; cityHi: string; city: string }) {
  const t = useTranslations('PolePrint.plate');
  return (
    <article className="flex h-[88mm] flex-col items-center justify-between rounded-[4mm] border-2 border-foreground bg-surface p-[4mm] text-center text-foreground break-inside-avoid">
      <header className="w-full">
        <p className="text-[11pt] leading-tight font-bold" lang="hi">
          {cityHi}
        </p>
        <p className="text-[8pt] leading-tight">{city}</p>
      </header>
      <div>
        <p className="text-[10pt] leading-tight font-semibold" lang="hi">
          {t('headlineHi')}
        </p>
        <p className="text-[8pt] leading-tight">{t('headline')}</p>
      </div>
      <QrCode value={plateUrl(code)} label={t('qrLabel', { code })} className="size-[44mm]" />
      <div>
        <p className="font-mono text-[15pt] leading-none font-bold tracking-wide">{code}</p>
        <p className="mt-[1.5mm] text-[6.5pt] leading-tight">
          <span lang="hi">{t('typeHi', { host: portalHost })}</span> ·{' '}
          {t('type', { host: portalHost })}
        </p>
      </div>
    </article>
  );
}

function PrintPoles() {
  const t = useTranslations('PolePrint');
  const format = useFormatter();
  const user = useSessionUser();
  const params = useSearchParams();
  const [source, setSource] = useState<Source>(
    params.get('source') === 'import' ? 'import' : 'all',
  );
  const [lastImport, setLastImport] = useState<string[]>([]);
  const [misconfigured, setMisconfigured] = useState(false);

  useEffect(() => {
    setLastImport(readLastImport());
    setMisconfigured(portalMisconfigured(window.location.host));
  }, []);

  const zones = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.request<ZoneDto[]>('/v1/zones'),
  });

  const fetched = useQuery({
    queryKey: ['plate-codes', source],
    queryFn: () => fetchCodes(source.startsWith('zone:') ? source.slice(5) : undefined),
    enabled: source !== 'import',
  });

  const codes = source === 'import' ? lastImport : (fetched.data?.codes ?? []);
  const loading = source !== 'import' && fetched.isPending;
  const tenant = user.tenant;

  return (
    <>
      <div className="mb-6 grid gap-4 print:hidden">
        <Link
          href="/poles"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline [&_svg]:size-4"
        >
          <ArrowLeft aria-hidden="true" />
          {t('back')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>

        {misconfigured ? (
          <Alert tone="danger" title={t('misconfigured.title')}>
            {t('misconfigured.body')}
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('source')} className="min-w-64">
            {({ id }) => (
              <Select
                id={id}
                value={source}
                onChange={(event) => setSource(event.target.value as Source)}
              >
                <option value="import" disabled={lastImport.length === 0}>
                  {t('sources.import', { count: lastImport.length })}
                </option>
                <option value="all">{t('sources.all')}</option>
                {zones.data?.map((zone) => (
                  <option key={zone.id} value={`zone:${zone.id}`}>
                    {t('sources.zone', { code: zone.code, name: zone.name })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button
            disabled={misconfigured || loading || codes.length === 0}
            onClick={() => window.print()}
          >
            <Printer aria-hidden="true" />
            {t('print', { count: codes.length, formatted: format.number(codes.length) })}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t('printTips')}</p>
        {fetched.data?.truncated ? (
          <Alert tone="warning">
            {t('truncated', { max: format.number(MAX_PLATES_PER_PRINT) })}
          </Alert>
        ) : null}
        {fetched.error ? <Alert tone="danger">{t('loadFailed')}</Alert> : null}
      </div>

      {loading ? (
        <Skeleton className="h-80 print:hidden" />
      ) : codes.length === 0 ? (
        <p className="text-muted-foreground print:hidden">{t('empty')}</p>
      ) : misconfigured ? null : (
        <section aria-label={t('platesLabel')} className="grid grid-cols-2 gap-[4mm]">
          {codes.map((code) => (
            <Plate key={code} code={code} cityHi={tenant?.nameHi ?? ''} city={tenant?.name ?? ''} />
          ))}
        </section>
      )}
    </>
  );
}

export default function PrintPolesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-80" />}>
      <PrintPoles />
    </Suspense>
  );
}
