import { useState } from 'react';
import { useUserSession } from '@/entities/user';
import { trpcClient, waitForPendingRefresh } from '@/shared/api';
import { navigate } from '@/shared/lib/navigate';

export function SignOutButton() {
  const session = useUserSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await waitForPendingRefresh();
      await trpcClient.auth.logout.mutate();
      session.clear();
      navigate('/login');
    } catch {
      setError('로그아웃에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="sign-out">
      <button type="button" onClick={() => { void signOut(); }} disabled={pending}>로그아웃</button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
