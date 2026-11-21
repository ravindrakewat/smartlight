'use client';

import { ApiClientError } from '@smart-light/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            // Do not retry auth or validation errors; retry network hiccups twice.
            retry: (failureCount, error) =>
              !(error instanceof ApiClientError && error.status >= 400 && error.status < 500) &&
              failureCount < 2,
          },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
