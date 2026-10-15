import { SignInForm } from '@/features/sign-in';
import { navigate } from '@/shared/lib/navigate';

export function LoginPage() {
  return (
    <main className="auth-page">
      <a className="auth-page__brand" href="/">root<span>.</span></a>
      <section className="auth-page__card">
        <p className="auth-page__eyebrow">ENGLISH SPEAKING ASSESSMENT</p>
        <h1>로그인</h1>
        <p>내 영어 회화 평가를 이어가세요.</p>
        <SignInForm onSuccess={() => navigate('/')} />
        <p className="auth-page__switch">계정이 없나요? <a href="/signup">회원가입</a></p>
      </section>
    </main>
  );
}
