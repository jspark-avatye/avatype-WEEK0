import { SignUpForm } from '@/features/sign-up';
import { navigate } from '@/shared/lib/navigate';

export function SignupPage() {
  return (
    <main className="auth-page">
      <a className="auth-page__brand" href="/">root<span>.</span></a>
      <section className="auth-page__card">
        <p className="auth-page__eyebrow">ENGLISH SPEAKING ASSESSMENT</p>
        <h1>회원가입</h1>
        <p>계정을 만들고 회화 평가를 시작하세요.</p>
        <SignUpForm onSuccess={() => navigate('/')} />
        <p className="auth-page__switch">이미 계정이 있나요? <a href="/login">로그인</a></p>
      </section>
    </main>
  );
}
