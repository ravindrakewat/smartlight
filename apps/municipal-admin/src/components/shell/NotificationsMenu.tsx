'use client';

import type { NotificationDto } from '@smart-light/shared';
import { cn } from '@smart-light/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '@/lib/api';

const KNOWN = new Set([
  'work_order.assigned',
  'work_order.fix_rejected',
  'work_order.verified',
  'work_order.awaiting_verification',
  'work_order.sla_breached',
]);

/** Inbox button in the top bar: the signed-in person's own notifications. */
export function NotificationsMenu() {
  const t = useTranslations('Notifications');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const queryClient = useQueryClient();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  const count = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.request<{ unread: number }>('/v1/notifications/unread-count'),
    refetchInterval: 60_000,
    retry: false,
  });
  const list = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.page<NotificationDto>('/v1/notifications', { query: { pageSize: 15 } }),
    enabled: open,
  });
  const markRead = useMutation({
    mutationFn: (body: { ids: string[] } | { all: true }) =>
      api.request<{ unread: number }>('/v1/notifications/read', { method: 'POST', body }),
    onSuccess: (data) => {
      queryClient.setQueryData(['notifications', 'unread'], data);
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
    },
  });

  // Close on Escape or a click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const unread = count.data?.unread ?? 0;
  const text = (item: NotificationDto) => {
    const values = {
      number: String(item.data['number'] ?? ''),
      poleCode: String(item.data['poleCode'] ?? ''),
    };
    return KNOWN.has(item.kind)
      ? t(`kinds.${item.kind}` as Parameters<typeof t>[0], values)
      : t('kinds.other', values);
  };

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread ? t('buttonUnread', { count: unread }) : t('button')}
        title={unread ? t('buttonUnread', { count: unread }) : t('button')}
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-11 place-items-center rounded-full text-foreground hover:bg-surface-subtle"
      >
        <Inbox aria-hidden="true" className="size-5" />
        {unread ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.6875rem] leading-5 font-bold text-primary-foreground tabular-nums"
          >
            {unread > 99 ? '99+' : format.number(unread)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={t('title')}
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t('title')}</h2>
            {unread ? (
              <button
                type="button"
                className="min-h-11 text-sm font-medium text-primary hover:underline"
                onClick={() => markRead.mutate({ all: true })}
              >
                {t('markAll')}
              </button>
            ) : null}
          </div>
          {list.isLoading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t('loading')}</p>
          ) : list.data && list.data.items.length > 0 ? (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {list.data.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={
                      item.entityType === 'work_order' && item.entityId
                        ? `/work-orders/${item.entityId}`
                        : '/'
                    }
                    onClick={() => {
                      if (!item.read) markRead.mutate({ ids: [item.id] });
                      setOpen(false);
                    }}
                    className={cn(
                      'flex gap-3 px-4 py-3 text-sm hover:bg-surface-subtle',
                      !item.read && 'bg-primary/5',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        item.read ? 'bg-transparent' : 'bg-primary',
                      )}
                    />
                    <span className="min-w-0">
                      <span className={cn('block', !item.read && 'font-semibold')}>
                        {text(item)}
                        {item.read ? null : <span className="sr-only"> ({t('unread')})</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {format.relativeTime(new Date(item.createdAt), now)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t('empty')}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
