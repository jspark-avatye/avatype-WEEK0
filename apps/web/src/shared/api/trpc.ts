import { createTRPCReact } from '@trpc/react-query';
import { httpLink } from '@trpc/client';
import type { AppRouter } from '@root/trpc-contract';
import { env } from '@/shared/config';
import { getAccessToken, setAccessToken } from './access-token';

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: env.trpcUrl,
      headers: () => {
        const token = getAccessToken();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
      fetch: async (url, options) => {
        const initialHeaders = new Headers(options?.headers);
        const requestedToken = initialHeaders.get('authorization');
        const request = { ...options, credentials: 'same-origin' as const };
        const response = await fetch(url, request);
        const path = new URL(String(url), window.location.href).pathname;
        if (response.status !== 401 || /\/auth\.(signup|login|refresh|logout)$/.test(path)) {
          return response;
        }
        try {
          if (requestedToken === (getAccessToken() ? `Bearer ${getAccessToken()}` : null)) {
            await refreshAccessToken();
          }
          const retryHeaders = new Headers(options?.headers);
          const token = getAccessToken();
          if (!token) return response;
          retryHeaders.set('authorization', `Bearer ${token}`);
          return fetch(url, { ...request, headers: retryHeaders });
        } catch {
          return response;
        }
      },
    }),
  ],
});

let pendingRefresh: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!pendingRefresh) {
    pendingRefresh = trpcClient.auth.refresh.mutate()
      .then(({ accessToken }) => {
        setAccessToken(accessToken);
        return accessToken;
      })
      .catch((error: unknown) => {
        setAccessToken(null);
        throw error;
      })
      .finally(() => { pendingRefresh = null; });
  }
  return pendingRefresh;
}

export async function waitForPendingRefresh(): Promise<void> {
  if (pendingRefresh) await pendingRefresh.catch(() => undefined);
}
