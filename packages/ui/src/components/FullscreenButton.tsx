'use client';

import { Maximize, Minimize } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './Button';

export interface FullscreenButtonProps {
  /** Accessible name, e.g. "Full screen". */
  label: string;
}

/** Full-screen toggle for the top bar, handy on a control-room wall display. */
export function FullscreenButton({ label }: FullscreenButtonProps) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setSupported(document.fullscreenEnabled);
    const sync = () => setActive(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  if (!supported) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="hidden rounded-full md:inline-flex"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }}
    >
      {active ? <Minimize /> : <Maximize />}
    </Button>
  );
}
