'use client';

import { ApiClientError, type PublicComplaintDto } from '@smart-light/shared';
import { Alert, Badge, Button, Card, Field, Input, Skeleton, cn, type Tone } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

const PROGRESS = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED'] as const;

const STATUS_TONES: Record<PublicComplaintDto['status'], Tone> = {
  SUBMITTED: 'info',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  REJECTED: 'neutral',
};

export function TrackView() {
  const t = useTranslations('Track');
  const tStatus = useTranslations('ComplaintStatus');
  const tCategory = useTranslations('Categories');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const number = searchParams.get('number')?.trim().toUpperCase() ?? '';
  const [input, setInput] = useState(number);

  const { data, error, isFetching } = useQuery({
    queryKey: ['complaint', number],
    queryFn: () =>
      api.request<PublicComplaintDto>(`/v1/public/complaints/${encodeURIComponent(number)}`),
    enabled: number.length >= 5,
    refetchInterval: 60_000,
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = input.trim().toUpperCase();
    if (value) {
      router.replace(`${pathname}?number=${encodeURIComponent(value)}`);
    }
  }

  const dateTime = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });
  const reachedAt = new Map(data?.timeline.map((entry) => [entry.status, entry.at]));

  return (
    <div className="grid gap-5">
      <Card className="p-5 sm:p-6">
        <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={onSubmit}>
          <Field label={t('numberLabel')} hint={t('numberHint')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                autoCapitalize="characters"
                className="font-mono text-lg tracking-wide uppercase"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" size="lg" className="sm:mb-6" disabled={!input.trim()}>
            {t('search')}
          </Button>
        </form>
      </Card>

      {isFetching && !data ? <Skeleton className="h-64" /> : null}

      {error ? (
        error instanceof ApiClientError && error.status === 404 ? (
          <Alert tone="warning">{t('notFound')}</Alert>
        ) : (
          <Alert tone="danger" title={tCommon('errorTitle')}>
            {tCommon('errorBody')}
          </Alert>
        )
      ) : null}

      {data ? (
        <Card className="p-5 sm:p-6" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xl font-bold">{data.number}</p>
              <p className="mt-1 font-medium">{tCategory(data.category)}</p>
              <p className="text-sm text-muted-foreground">
                {data.poleCode ? `${t('pole', { code: data.poleCode })} · ` : ''}
                {t('filed', { date: dateTime(data.createdAt) })}
              </p>
            </div>
            <Badge tone={STATUS_TONES[data.status]} className="text-sm">
              {tStatus(data.status)}
            </Badge>
          </div>

          {data.status === 'REJECTED' ? null : (
            <ol className="mt-6 grid gap-0">
              {PROGRESS.map((status, index) => {
                const at = reachedAt.get(status);
                const done = Boolean(at);
                const last = index === PROGRESS.length - 1;
                return (
                  <li key={status} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-bold',
                          done
                            ? 'border-success bg-success text-white'
                            : 'border-border bg-surface text-muted-foreground',
                        )}
                      >
                        {done ? <Check aria-hidden="true" className="size-4" /> : index + 1}
                      </span>
                      {!last ? (
                        <span
                          aria-hidden="true"
                          className={cn('my-1 w-0.5 flex-1', done ? 'bg-success' : 'bg-border')}
                        />
                      ) : null}
                    </div>
                    <div className={cn('pb-6', last && 'pb-0')}>
                      <p className={cn('font-semibold', !done && 'text-muted-foreground')}>
                        {tStatus(status)}
                      </p>
                      {at ? <p className="text-sm text-muted-foreground">{dateTime(at)}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {data.status !== 'RESOLVED' && data.status !== 'REJECTED' && data.slaDueAt ? (
            <p className="mt-4 rounded-lg bg-surface-subtle p-3 text-sm">
              {t('deadline', { date: dateTime(data.slaDueAt) })}
            </p>
          ) : null}
          {data.resolvedAt ? (
            <p className="mt-4 rounded-lg bg-success-subtle p-3 text-sm font-medium text-success">
              {t('resolvedOn', { date: dateTime(data.resolvedAt) })}
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
