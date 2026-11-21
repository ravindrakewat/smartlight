import type { ApiErrorDetail } from '../types/api';
import type { PaginationMeta } from '../types/common';

/**
 * Minimal typed client for the central API, shared by the web consoles, the
 * citizen portal and the mobile app. Uses the platform `fetch` (browser,
 * Node 18+, React Native) — no extra dependencies.
 */

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface Page<TItem> {
  items: TItem[];
  pagination: PaginationMeta;
}

export interface ApiClientOptions {
  /** e.g. `http://localhost:4000/api` */
  baseUrl: string;
  /** Web: `'include'` so httpOnly auth cookies are sent. */
  credentials?: 'include' | 'same-origin' | 'omit';
  /** Extra headers per request (mobile: `Authorization: Bearer …`). */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /**
   * Called once when a request returns 401. Return true if the session was
   * refreshed; the request is then retried a single time.
   */
  onUnauthorized?: () => Promise<boolean>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

interface Envelope {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: ApiErrorDetail[] };
  meta?: { pagination?: PaginationMeta };
}

function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  if (!query) {
    return url;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

export function createApiClient(options: ApiClientOptions) {
  let refreshing: Promise<boolean> | null = null;

  /** Concurrent 401s share one refresh call (refresh tokens rotate). */
  function refreshOnce(): Promise<boolean> {
    if (!options.onUnauthorized) {
      return Promise.resolve(false);
    }
    refreshing ??= options.onUnauthorized().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function send(
    path: string,
    request: RequestOptions,
    retry: boolean,
  ): Promise<Envelope | null> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...((await options.getHeaders?.()) ?? {}),
    };
    let response: Response;
    try {
      response = await fetch(buildUrl(options.baseUrl, path, request.query), {
        method: request.method ?? 'GET',
        headers,
        body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
        credentials: options.credentials,
        signal: request.signal,
      });
    } catch {
      throw new ApiClientError(
        0,
        'NETWORK_ERROR',
        'Cannot reach the server. Check your connection.',
      );
    }

    if (response.status === 401 && retry && (await refreshOnce())) {
      return send(path, request, false);
    }
    if (response.status === 204) {
      return null;
    }

    let envelope: Envelope;
    try {
      envelope = (await response.json()) as Envelope;
    } catch {
      throw new ApiClientError(response.status, 'INVALID_RESPONSE', 'Unexpected server response');
    }
    if (!response.ok || !envelope.success) {
      throw new ApiClientError(
        response.status,
        envelope.error?.code ?? 'UNKNOWN_ERROR',
        envelope.error?.message ?? 'Request failed',
        envelope.error?.details,
      );
    }
    return envelope;
  }

  return {
    /** Returns `data` of a success envelope (undefined for 204). */
    async request<TData>(path: string, request: RequestOptions = {}): Promise<TData> {
      const envelope = await send(path, request, true);
      return envelope?.data as TData;
    },

    /** Returns items plus pagination for list endpoints. */
    async page<TItem>(path: string, request: RequestOptions = {}): Promise<Page<TItem>> {
      const envelope = await send(path, request, true);
      return {
        items: (envelope?.data as TItem[]) ?? [],
        pagination: envelope?.meta?.pagination ?? {
          page: 1,
          pageSize: 0,
          totalItems: 0,
          totalPages: 1,
        },
      };
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
