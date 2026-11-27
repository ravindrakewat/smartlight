'use client';

import { ApiClientError, type SparePartDto, type StockMovementDto } from '@smart-light/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  Field,
  Input,
  KpiCard,
  Select,
  Skeleton,
} from '@smart-light/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, PackageCheck, PackagePlus, TriangleAlert, Wrench } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useSessionUser } from '@/components/Session';
import { ConsoleHero } from '@/components/shell/ConsoleHero';
import { api } from '@/lib/api';

const EDITORS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR']);

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

function AddPartForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('Inventory');
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    code: '',
    name: '',
    nameHi: '',
    unit: 'pcs',
    minStock: '0',
    openingStock: '0',
  });
  const create = useMutation({
    mutationFn: () =>
      api.request<SparePartDto>('/v1/spare-parts', {
        method: 'POST',
        body: {
          code: form.code,
          name: form.name,
          ...(form.nameHi.trim() ? { nameHi: form.nameHi } : {}),
          unit: form.unit,
          minStock: Number(form.minStock),
          openingStock: Number(form.openingStock),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['spare-parts'] });
      onDone();
    },
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Card className="mb-6 p-5">
      <h2 className="mb-4 text-base font-semibold">{t('add.title')}</h2>
      <form
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Field label={t('fields.code')} hint={t('fields.codeHint')} required>
          {(ids) => (
            <Input
              id={ids.id}
              aria-describedby={ids.describedBy}
              value={form.code}
              onChange={set('code')}
              required
              maxLength={30}
            />
          )}
        </Field>
        <Field label={t('fields.name')} required>
          {(ids) => (
            <Input
              id={ids.id}
              aria-describedby={ids.describedBy}
              value={form.name}
              onChange={set('name')}
              required
              maxLength={120}
            />
          )}
        </Field>
        <Field label={t('fields.nameHi')}>
          {(ids) => (
            <Input
              id={ids.id}
              aria-describedby={ids.describedBy}
              value={form.nameHi}
              onChange={set('nameHi')}
              maxLength={120}
              lang="hi"
            />
          )}
        </Field>
        <Field label={t('fields.unit')}>
          {(ids) => (
            <Select
              id={ids.id}
              aria-describedby={ids.describedBy}
              value={form.unit}
              onChange={set('unit')}
            >
              {['pcs', 'm', 'set', 'kg'].map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('fields.minStock')} hint={t('fields.minStockHint')}>
          {(ids) => (
            <Input
              id={ids.id}
              aria-describedby={ids.describedBy}
              type="number"
              min={0}
              value={form.minStock}
              onChange={set('minStock')}
            />
          )}
        </Field>
        <Field label={t('fields.openingStock')}>
          {(ids) => (
            <Input
              id={ids.id}
              aria-describedby={ids.describedBy}
              type="number"
              min={0}
              value={form.openingStock}
              onChange={set('openingStock')}
            />
          )}
        </Field>
        {create.isError ? (
          <Alert tone="danger" className="sm:col-span-2 lg:col-span-3">
            {errorText(create.error, t('saveFailed'))}
          </Alert>
        ) : null}
        <div className="flex gap-3 sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={create.isPending}>
            {t('add.submit')}
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function StockPanel({ part, canEdit }: { part: SparePartDto; canEdit: boolean }) {
  const t = useTranslations('Inventory');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<'RECEIVED' | 'ADJUSTED'>('RECEIVED');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const movements = useQuery({
    queryKey: ['spare-parts', part.id, 'movements'],
    queryFn: () => api.request<StockMovementDto[]>(`/v1/spare-parts/${part.id}/movements`),
  });
  const save = useMutation({
    mutationFn: () =>
      api.request<SparePartDto>(`/v1/spare-parts/${part.id}/stock`, {
        method: 'POST',
        body: { kind, quantity: Number(quantity), ...(note.trim() ? { note } : {}) },
      }),
    onSuccess: async () => {
      setQuantity('');
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['spare-parts'] });
    },
  });

  return (
    <div className="grid gap-5 bg-surface-subtle/50 px-5 py-4 lg:grid-cols-[22rem_1fr]">
      {canEdit ? (
        <form
          className="grid content-start gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <h3 className="text-sm font-semibold">{t('stock.title')}</h3>
          <Field label={t('stock.kind')}>
            {(ids) => (
              <Select
                id={ids.id}
                aria-describedby={ids.describedBy}
                value={kind}
                onChange={(event) => setKind(event.target.value as 'RECEIVED' | 'ADJUSTED')}
              >
                <option value="RECEIVED">{t('kind.RECEIVED')}</option>
                <option value="ADJUSTED">{t('kind.ADJUSTED')}</option>
              </Select>
            )}
          </Field>
          <Field
            label={t('stock.quantity')}
            hint={kind === 'ADJUSTED' ? t('stock.adjustHint') : undefined}
            required
          >
            {(ids) => (
              <Input
                id={ids.id}
                aria-describedby={ids.describedBy}
                type="number"
                required
                min={kind === 'RECEIVED' ? 1 : undefined}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('stock.note')} required={kind === 'ADJUSTED'}>
            {(ids) => (
              <Input
                id={ids.id}
                aria-describedby={ids.describedBy}
                value={note}
                required={kind === 'ADJUSTED'}
                maxLength={300}
                onChange={(event) => setNote(event.target.value)}
              />
            )}
          </Field>
          {save.isError ? (
            <Alert tone="danger">{errorText(save.error, t('saveFailed'))}</Alert>
          ) : null}
          <Button type="submit" disabled={save.isPending || quantity === ''}>
            {t('stock.submit')}
          </Button>
        </form>
      ) : null}
      <div className="min-w-0">
        <h3 className="mb-2 text-sm font-semibold">{t('ledger.title')}</h3>
        {movements.isLoading ? (
          <Skeleton className="h-24" />
        ) : movements.data && movements.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
            {movements.data.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
              >
                <span>
                  <span className="font-medium">{t(`kind.${row.kind}`)}</span>
                  {row.workOrderNumber ? (
                    <span className="font-mono text-xs"> · {row.workOrderNumber}</span>
                  ) : null}
                  {row.note && !row.workOrderNumber ? (
                    <span className="text-muted-foreground"> · {row.note}</span>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">
                    {format.dateTime(new Date(row.createdAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    {row.actorName ? ` · ${row.actorName}` : ''}
                  </span>
                </span>
                <span
                  className={cn(
                    'tabular-nums font-semibold',
                    row.quantity < 0 ? 'text-danger' : 'text-success',
                  )}
                >
                  {row.quantity > 0 ? '+' : ''}
                  {format.number(row.quantity)} {part.unit}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('ledger.empty')}</p>
        )}
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const t = useTranslations('Inventory');
  const tCommon = useTranslations('Common');
  const format = useFormatter();
  const user = useSessionUser();
  const canEdit = EDITORS.has(user.role);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const parts = useQuery({
    queryKey: ['spare-parts', 'list'],
    queryFn: () => api.request<SparePartDto[]>('/v1/spare-parts', { query: { all: true } }),
  });

  const rows = parts.data ?? [];
  const active = rows.filter((row) => row.active);
  const low = active.filter((row) => row.lowStock);
  const used = active.reduce((sum, row) => sum + row.usedLast30Days, 0);

  return (
    <>
      <ConsoleHero
        title={t('title')}
        description={t('description')}
        icon={<Boxes />}
        actions={
          canEdit && !adding ? (
            <Button onClick={() => setAdding(true)}>
              <PackagePlus aria-hidden="true" />
              {t('add.open')}
            </Button>
          ) : null
        }
      />

      {adding ? <AddPartForm onDone={() => setAdding(false)} /> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={t('kpi.parts')}
          value={format.number(active.length)}
          icon={<PackageCheck />}
          tone="info"
        />
        <KpiCard
          label={t('kpi.low')}
          value={format.number(low.length)}
          icon={<TriangleAlert />}
          tone={low.length > 0 ? 'danger' : 'success'}
          hint={t('kpi.lowHint')}
        />
        <KpiCard
          label={t('kpi.used')}
          value={format.number(used)}
          icon={<Wrench />}
          tone="warning"
          hint={t('kpi.usedHint')}
        />
      </div>

      {parts.isError ? (
        <Alert tone="danger" title={tCommon('errorTitle')}>
          {tCommon('errorBody')}
        </Alert>
      ) : parts.isLoading ? (
        <Skeleton className="h-80" />
      ) : rows.length === 0 ? (
        <EmptyState
          className="min-h-64"
          icon={<Boxes />}
          title={t('empty.title')}
          description={canEdit ? t('empty.editor') : t('empty.viewer')}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-surface-subtle/60 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('columns.part')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    {t('columns.stock')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    {t('columns.minStock')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    {t('columns.used')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('columns.status')}
                  </th>
                  <th scope="col" className="px-5 py-3">
                    <span className="sr-only">{t('columns.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((part) => {
                  const open = openId === part.id;
                  return [
                    <tr key={part.id} className={cn(!part.active && 'text-muted-foreground')}>
                      <td className="px-5 py-3">
                        <span className="font-medium">{part.name}</span>
                        {part.nameHi ? (
                          <span className="block text-xs text-muted-foreground" lang="hi">
                            {part.nameHi}
                          </span>
                        ) : null}
                        <span className="block font-mono text-xs text-muted-foreground">
                          {part.code}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">
                        {format.number(part.stockQty)} {part.unit}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {format.number(part.minStock)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {format.number(part.usedLast30Days)}
                      </td>
                      <td className="px-3 py-3">
                        {!part.active ? (
                          <Badge tone="neutral">{t('status.inactive')}</Badge>
                        ) : part.lowStock ? (
                          <Badge tone="danger">{t('status.low')}</Badge>
                        ) : (
                          <Badge tone="success">{t('status.ok')}</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          aria-expanded={open}
                          onClick={() => setOpenId(open ? null : part.id)}
                        >
                          {canEdit ? t('manage') : t('history')}
                        </Button>
                      </td>
                    </tr>,
                    open ? (
                      <tr key={`${part.id}-panel`}>
                        <td colSpan={6} className="p-0">
                          <StockPanel part={part} canEdit={canEdit && part.active} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
