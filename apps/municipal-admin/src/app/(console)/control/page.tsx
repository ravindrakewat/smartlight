'use client';

import type { PoleMapItemDto, ZoneDto } from '@smart-light/shared';
import { Button, EmptyState, Input, Panel, StreetLightIcon } from '@smart-light/ui';
import { useQuery } from '@tanstack/react-query';
import { MapPinned, Search, SlidersHorizontal, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { SelectedLight } from '@/components/dashboard/SelectedLight';
import { GroupOverride } from '@/components/lighting/GroupOverride';
import { LightingStatus } from '@/components/lighting/ScheduleOverview';
import { useSessionUser } from '@/components/Session';
import { ConsoleHero } from '@/components/shell/ConsoleHero';
import { api } from '@/lib/api';

/** Roles allowed to switch lights (the API checks this again). */
const CONTROLLERS = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR']);

export default function RemoteControlPage() {
  const t = useTranslations('Control');
  const tOverride = useTranslations('Lighting.schedules.override');
  const user = useSessionUser();
  const allowed = CONTROLLERS.has(user.role);
  const [search, setSearch] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [poleId, setPoleId] = useState<string | null>(null);

  const zones = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.request<ZoneDto[]>('/v1/zones'),
    enabled: allowed,
  });
  const poles = useQuery({
    queryKey: ['pole-map'],
    queryFn: () => api.request<PoleMapItemDto[]>('/v1/poles/map'),
    enabled: allowed,
  });

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const query = search.trim().toLowerCase();
    if (!query) return;
    const match =
      poles.data?.find((pole) => pole.code.toLowerCase() === query) ??
      poles.data?.find((pole) => pole.code.toLowerCase().includes(query));
    setNotFound(!match);
    if (match) setPoleId(match.id);
  }

  if (!allowed) {
    return (
      <>
        <ConsoleHero title={t('title')} description={t('description')} icon={<Zap />} />
        <EmptyState icon={<Zap />} title={t('noAccess')} />
      </>
    );
  }

  return (
    <>
      <ConsoleHero title={t('title')} description={t('description')} icon={<Zap />} />

      <LightingStatus />

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel id="control-group" title={t('group.title')} icon={<MapPinned />}>
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">{tOverride('description')}</p>
            <GroupOverride zones={zones.data} />
          </div>
        </Panel>

        <Panel id="control-single" title={t('single.title')} icon={<StreetLightIcon />}>
          <div className="grid gap-4">
            <form onSubmit={onSearch} role="search" className="grid gap-1.5">
              <label htmlFor="control-search" className="text-sm font-medium">
                {t('single.label')}
              </label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="control-search"
                    type="search"
                    value={search}
                    placeholder={t('single.placeholder')}
                    aria-invalid={notFound}
                    aria-describedby={notFound ? 'control-search-error' : undefined}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setNotFound(false);
                    }}
                    className="h-11 pl-9"
                  />
                </div>
                <Button type="submit" disabled={!poles.data}>
                  {t('single.find')}
                </Button>
              </div>
              {notFound ? (
                <p id="control-search-error" role="alert" className="text-sm text-danger">
                  {t('single.notFound', { query: search.trim() })}
                </p>
              ) : null}
            </form>
            {poleId ? (
              <SelectedLight poleId={poleId} canControl />
            ) : (
              <EmptyState icon={<SlidersHorizontal />} title={t('single.pick')} />
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
