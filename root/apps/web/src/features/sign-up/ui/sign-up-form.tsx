import { useState, type FormEvent } from 'react';
import { useUserSession } from '@/entities/user';
import { trpcClient } from '@/shared/api';
import { Button } from '@/shared/ui/button';

export function SignUpForm({ onSuccess }: { onSuccess(): void }) {
  const session = useUserSession();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const result = await trpcClient.auth.signup.mutate({ loginId, password, passwordConfirm });
      session.accept(result.user, result.accessToken);
      onSuccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '회원가입에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={(event) => { void submit(event); }}>
      <label>로그인 ID
        <input autoComplete="username" name="loginId" required minLength={4} maxLength={32} pattern="[a-zA-Z0-9._-]+" title="영문, 숫자, ., _, -만 사용할 수 있습니다." value={loginId} onChange={(event) => setLoginId(event.target.value)} />
      </label>
      <label>비밀번호
        <input autoComplete="new-password" name="password" type="password" required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <label>비밀번호 확인
        <input autoComplete="new-password" name="passwordConfirm" type="password" required value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />
      </label>
      {error && <p className="auth-form__error" role="alert">{error}</p>}
      <Button type="submit" disabled={pending}>{pending ? '가입 중…' : '회원가입'}</Button>
    </form>
  );
}
