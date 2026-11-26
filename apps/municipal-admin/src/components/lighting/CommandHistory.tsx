'use client';

import type { DeviceCommandDto } from '@smart-light/shared';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Pagination,
  Skeleton,
} from '@smart-light/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api';

const PAGE_SIZE = 5;
/** Same pace as the rest of the live pole page. */
const REFRESH_MS = 15_000;

function statusTone(status: DeviceCommandDto['status']) {
  if (status === 'ACCEPTED' || status === 'COMPLETED') return 'success';
  if (status === 'REJECTED' || status === 'FAILED' || status === 'EXPIRED') return 'danger';
  return 'info';
}

/**
 * Commands sent to the pole's controller, newest first, five per page. The query key
 * sits under ['pole-live', poleId], so the page's refresh after a command reloads it too.
 */
export function CommandHistory({ poleId }: { poleId: string }) {
  const t = useTranslations('Lighting.pole');
  const tCmd = useTranslations('Lighting.commands');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const [page, setPage] = useState(1);

  const commands = useQuery({
    queryKey: ['pole-live', poleId, 'commands', page],
    queryFn: () =>
      api.page<DeviceCommandDto>(`/v1/poles/${poleId}/commands`, {
        query: { page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    // Only the first page changes when new commands arrive.
    refetchInterval: page === 1 ? REFRESH_MS : false,
  });

  const data = commands.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('commands.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {commands.isLoading ? (
          <Skeleton className="h-40" />
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('commands.empty')}</p>
        ) : (
          <>
            <ul className="divide-y divide-border text-sm" aria-busy={commands.isFetching}>
              {data.items.map((command) => (
                <li key={command.id} className="grid gap-0.5 py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {command.action === 'set_output'
                        ? command.on
                          ? tCmd('on', { value: command.dimPercent ?? 100 })
                          : tCmd('off')
                        : tCmd(command.action as 'set_auto')}
                    </span>
                    <Badge tone={statusTone(command.status)}>
                      {tCmd(`status.${command.status}`)}
                    </Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      command.createdBy?.name ?? tCmd('system'),
                      format.dateTime(new Date(command.createdAt), {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }),
                      command.until
                        ? tCmd('until', {
                            time: format.dateTime(new Date(command.until), {
                              timeStyle: 'short',
                            }),
                          })
                        : null,
                      command.reason,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
            {data.pagination.totalPages > 1 ? (
              <Pagination
                className="mt-3"
                page={data.pagination.page}
                totalPages={data.pagination.totalPages}
                onChange={setPage}
                labels={{
                  previous: tCommon('previous'),
                  next: tCommon('next'),
                  status: tCommon('pageStatus', {
                    page: data.pagination.page,
                    total: data.pagination.totalPages,
                  }),
                }}
              />
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
