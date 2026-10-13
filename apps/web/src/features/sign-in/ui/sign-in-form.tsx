import { useState, type FormEvent } from 'react';
import { useUserSession } from '@/entities/user';
import { trpcClient } from '@/shared/api';
import { Button } from '@/shared/ui/button';

export function SignInForm({ onSuccess }: { onSuccess(): void }) {
  const session = useUserSession();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const result = await trpcClient.auth.login.mutate({ loginId, password });
      session.accept(result.user, result.accessToken);
      onSuccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '로그인에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={(event) => { void submit(event); }}>
      <label>로그인 ID
        <input autoComplete="username" name="loginId" required maxLength={32} value={loginId} onChange={(event) => setLoginId(event.target.value)} />
      </label>
      <label>비밀번호
        <input autoComplete="current-password" name="password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      {error && <p className="auth-form__error" role="alert">{error}</p>}
      <Button type="submit" disabled={pending}>{pending ? '로그인 중…' : '로그인'}</Button>
    </form>
  );
}
