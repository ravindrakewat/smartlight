import type { ReactNode } from 'react';
import { ConsoleShell } from '@/components/ConsoleShell';
import { SessionGuard } from '@/components/Session';

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleShell>
      <SessionGuard>{children}</SessionGuard>
    </ConsoleShell>
  );
}
