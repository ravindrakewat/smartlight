'use client';

import { useState, type FormEvent } from 'react';
import { Button } from './Button';
import { Alert } from './Feedback';
import { Field, Input } from './Form';

export interface ChangePasswordLabels {
  current: string;
  next: string;
  nextHint: string;
  repeat: string;
  mismatch: string;
  submit: string;
  success: string;
}

export interface ChangePasswordFormProps {
  labels: ChangePasswordLabels;
  /** Calls the API; resolve on success, or return a translated error message. */
  onSubmit: (currentPassword: string, newPassword: string) => Promise<string | null>;
}

/**
 * Presentational "change your password" form shared by the web consoles. The
 * app supplies translations and the API call; rules are enforced by the API.
 */
export function ChangePasswordForm({ labels, onSubmit }: ChangePasswordFormProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setDone(false);
    if (next !== repeat) {
      setError(labels.mismatch);
      return;
    }
    setBusy(true);
    const failure = await onSubmit(current, next);
    setBusy(false);
    setError(failure);
    if (!failure) {
      setDone(true);
      setCurrent('');
      setNext('');
      setRepeat('');
    }
  }

  return (
    <form className="grid max-w-md gap-4" onSubmit={(event) => void submit(event)}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {done ? <Alert tone="success">{labels.success}</Alert> : null}
      <Field label={labels.current} required>
        {({ id }) => (
          <Input
            id={id}
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        )}
      </Field>
      <Field label={labels.next} hint={labels.nextHint} required>
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="password"
            required
            minLength={10}
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,128}"
            autoComplete="new-password"
            aria-describedby={describedBy}
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        )}
      </Field>
      <Field label={labels.repeat} required>
        {({ id }) => (
          <Input
            id={id}
            type="password"
            required
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" className="w-fit" disabled={busy}>
        {labels.submit}
      </Button>
    </form>
  );
}
