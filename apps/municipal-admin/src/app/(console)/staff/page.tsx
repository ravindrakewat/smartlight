'use client';

import { USER_ROLES, type StaffUserDto, type UserRoleName } from '@smart-light/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Pagination,
  Select,
  Skeleton,
} from '@smart-light/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UsersRound } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Fragment, useEffect, useId, useState, type FormEvent } from 'react';
import { useSessionUser } from '@/components/Session';
import { AddStaffForm } from '@/components/staff/AddStaffForm';
import { AgenciesCard } from '@/components/staff/AgenciesCard';
import { api } from '@/lib/api';
import { canManage } from '@/lib/staff-permissions';
import { ConsoleHero } from '@/components/shell/ConsoleHero';

const PAGE_SIZE = 25;
const TENANT_ROLES = USER_ROLES.filter((role) => role !== 'SUPER_ADMIN');

function ResetPasswordRow({
  staff,
  columns,
  onDone,
}: {
  staff: StaffUserDto;
  columns: number;
  onDone: () => void;
}) {
  const t = useTranslations('Staff.reset');
  const passwordId = useId();
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () =>
      api.request(`/v1/users/${staff.id}/password-reset`, { method: 'POST', body: { password } }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    reset.mutate();
  }

  return (
    <tr className="bg-surface-subtle/60">
      <td colSpan={columns} className="px-5 py-4">
        {reset.isSuccess ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Alert tone="success" className="flex-1">
              {t('done', { name: staff.name })}
            </Alert>
            <Button size="sm" variant="secondary" onClick={onDone}>
              {t('close')}
            </Button>
          </div>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
            onSubmit={onSubmit}
          >
            <div className="grid gap-1.5">
              <label htmlFor={passwordId} className="text-sm font-medium">
                {t('label', { name: staff.name })}
              </label>
              <Input
                id={passwordId}
                type="password"
                required
                minLength={10}
                pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,128}"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('hint')}</p>
              {reset.error ? <Alert tone="danger">{t('failed')}</Alert> : null}
            </div>
            <Button type="submit" disabled={reset.isPending}>
              {t('submit')}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              {t('cancel')}
            </Button>
          </form>
        )}
      </td>
    </tr>
  );
}

export default function StaffPage() {
  const t = useTranslations('Staff');
  const tCommon = useTranslations('Common');
  const tRoles = useTranslations('Common.roles');
  const format = useFormatter();
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const searchId = useId();
  const roleId = useId();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState<UserRoleName | ''>('');
  const [page, setPage] = useState(1);
  const [resetting, setResetting] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const staff = useQuery({
    queryKey: ['staff', debouncedSearch, role, page],
    queryFn: () =>
      api.page<StaffUserDto>('/v1/users', {
        query: { search: debouncedSearch, role, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: StaffUserDto['status'] }) =>
      api.request<StaffUserDto>(`/v1/users/${input.id}`, {
        method: 'PATCH',
        body: { status: input.status },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      void queryClient.invalidateQueries({ queryKey: ['agencies'] });
    },
  });

  const columns = 4;

  return (
    <>
      <ConsoleHero
        icon={<UsersRound />}
        title={t('title')}
        description={t('description')}
        actions={
          staff.data ? (
            <span className="text-sm text-muted-foreground">
              {t('total', { count: staff.data.pagination.totalItems })}
            </span>
          ) : null
        }
      />

      <div className="grid gap-6 2xl:grid-cols-3">
        <div className="grid min-w-0 content-start gap-4 2xl:col-span-2">
          <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
            <div className="relative">
              <label htmlFor={searchId} className="sr-only">
                {t('search')}
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={searchId}
                type="search"
                className="pl-9"
                placeholder={t('search')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor={roleId} className="sr-only">
                {t('roleFilter')}
              </label>
              <Select
                id={roleId}
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as UserRoleName | '');
                  setPage(1);
                }}
              >
                <option value="">{t('allRoles')}</option>
                {TENANT_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {tRoles(value)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {staff.error ? (
            <Alert tone="danger" title={tCommon('errorTitle')}>
              {tCommon('errorBody')}
            </Alert>
          ) : null}
          {setStatus.error ? <Alert tone="danger">{t('statusFailed')}</Alert> : null}

          <Card className="overflow-hidden">
            {staff.isPending ? (
              <div className="grid gap-3 p-5">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-10" />
                ))}
              </div>
            ) : staff.data && staff.data.items.length === 0 ? (
              <EmptyState className="m-5" icon={<UsersRound />} title={t('empty')} />
            ) : staff.data ? (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="bg-surface-subtle/60">
                    <tr className="text-muted-foreground">
                      <th scope="col" className="px-5 py-3 font-medium">
                        {t('columns.name')}
                      </th>
                      <th scope="col" className="px-3 py-3 font-medium">
                        {t('columns.role')}
                      </th>
                      <th scope="col" className="px-3 py-3 font-medium">
                        {t('columns.status')}
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        <span className="sr-only">{t('columns.actions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {staff.data.items.map((member) => {
                      const manageable = canManage(user, member);
                      return (
                        <Fragment key={member.id}>
                          <tr className="hover:bg-surface-subtle/50">
                            <th scope="row" className="px-5 py-3 font-normal">
                              <span className="block font-medium">{member.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {member.email}
                                {member.phone ? ` · ${member.phone}` : ''}
                              </span>
                            </th>
                            <td className="px-3 py-3">
                              {tRoles(member.role)}
                              {member.agency ? (
                                <span className="block text-xs text-muted-foreground">
                                  {member.agency.name}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-3">
                              <Badge tone={member.status === 'ACTIVE' ? 'success' : 'neutral'}>
                                {t(`status.${member.status}`)}
                              </Badge>
                              <span className="mt-1 block text-xs whitespace-nowrap text-muted-foreground">
                                {t('lastLogin', {
                                  when: member.lastLoginAt
                                    ? format.dateTime(new Date(member.lastLoginAt), {
                                        dateStyle: 'medium',
                                      })
                                    : t('never'),
                                })}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-right whitespace-nowrap">
                              {manageable ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-expanded={resetting === member.id}
                                    onClick={() =>
                                      setResetting(resetting === member.id ? null : member.id)
                                    }
                                  >
                                    {t('actions.resetPassword')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className={
                                      member.status === 'ACTIVE' ? 'text-danger' : undefined
                                    }
                                    disabled={setStatus.isPending}
                                    onClick={() =>
                                      setStatus.mutate({
                                        id: member.id,
                                        status: member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                                      })
                                    }
                                  >
                                    {member.status === 'ACTIVE'
                                      ? t('actions.disable')
                                      : t('actions.enable')}
                                  </Button>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                          {resetting === member.id ? (
                            <ResetPasswordRow
                              staff={member}
                              columns={columns}
                              onDone={() => setResetting(null)}
                            />
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>

          {staff.data ? (
            <Pagination
              page={staff.data.pagination.page}
              totalPages={staff.data.pagination.totalPages}
              onChange={setPage}
              labels={{
                previous: tCommon('previous'),
                next: tCommon('next'),
                status: tCommon('pageStatus', {
                  page: staff.data.pagination.page,
                  total: staff.data.pagination.totalPages,
                }),
              }}
            />
          ) : null}
        </div>

        <div className="grid content-start items-start gap-6 lg:grid-cols-2 2xl:grid-cols-1">
          <AddStaffForm />
          <AgenciesCard />
        </div>
      </div>
    </>
  );
}
