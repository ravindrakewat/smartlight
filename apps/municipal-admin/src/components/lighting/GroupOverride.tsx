'use client';

import type { ZoneDto } from '@smart-light/shared';
import { Field, Select } from '@smart-light/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ControlPanel } from './ControlPanel';

/**
 * Switch the whole city or one zone for a while (festivals, VIP visits, storms).
 * Every action asks for confirmation first; the schedule resumes when the time is up.
 */
export function GroupOverride({ zones }: { zones: ZoneDto[] | undefined }) {
  const t = useTranslations('Lighting.schedules.override');
  const [target, setTarget] = useState('city');
  const targetName =
    target === 'city' ? t('city') : (zones?.find((zone) => zone.id === target)?.name ?? '');

  return (
    <>
      <Field label={t('target')}>
        {({ id }) => (
          <Select id={id} value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="city">{t('city')}</option>
            {zones?.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {t('zone', { code: zone.code, name: zone.name })}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <ControlPanel
        key={target}
        layout="tiles"
        target={target === 'city' ? { type: 'city' } : { type: 'zone', zoneId: target }}
        confirm={(action) => window.confirm(t(`confirm.${action}`, { target: targetName }))}
      />
    </>
  );
}
