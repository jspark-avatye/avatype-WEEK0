import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@root/trpc-contract';
import { refreshAccessToken, setAccessToken, trpcClient } from '@/shared/api';

type SessionContextValue = {
  user: PublicUser | null;
  restoring: boolean;
  accept(user: PublicUser, accessToken: string): void;
  clear(): void;
  refreshProfile(): Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function UserSessionProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [restoring, setRestoring] = useState(true);
  const refreshProfile = useCallback(async () => {
    const account = await trpcClient.auth.me.query();
    setUser((current) => current?.userId === account.userId ? account : current);
  }, []);

  useEffect(() => {
    const clear = () => { setAccessToken(null); setUser(null); queryClient.clear(); };
    window.addEventListener('root:unauthorized', clear);
    return () => window.removeEventListener('root:unauthorized', clear);
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    void refreshAccessToken()
      .then(() => trpcClient.auth.me.query())
      .then((account) => { if (active) setUser(account); })
      .catch(() => { if (active) { setAccessToken(null); setUser(null); } })
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, []);

  return (
    <SessionContext.Provider value={{
      user,
      restoring,
      refreshProfile,
      accept(account, token) { setAccessToken(token); setUser(account); },
      clear() { setAccessToken(null); setUser(null); queryClient.clear(); },
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useUserSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('UserSessionProvider is required');
  return value;
}
