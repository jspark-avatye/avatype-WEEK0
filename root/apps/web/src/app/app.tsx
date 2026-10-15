import { useEffect, useState } from 'react';
import { UserSessionProvider, useUserSession } from '@/entities/user';
import { HomePage } from '@/pages/home';
import { LoginPage } from '@/pages/login';
import { SignupPage } from '@/pages/signup';
import { EvaluationSetupPage } from '@/pages/evaluation-setup';
import { EvaluationPage } from '@/pages/evaluation';
import { ReportPage } from '@/pages/report';
import { EvaluationHistoryPage } from '@/pages/evaluation-history';
import { navigate } from '@/shared/lib/navigate';
import { AppProviders } from './providers/app-providers';
import { RenderErrorBoundary } from './providers/render-error-boundary';
import './styles/index.css';

function CurrentPage() {
  const { user, restoring } = useUserSession();
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onLocationChange = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onLocationChange);
    return () => window.removeEventListener('popstate', onLocationChange);
  }, []);

  useEffect(() => {
    if (restoring) return;
    if (!user && path !== '/login' && path !== '/signup') navigate('/login');
    if (user && (path === '/login' || path === '/signup')) navigate('/');
  }, [restoring, user, path]);

  if (restoring) return <main className="auth-page">인증 상태를 확인하고 있습니다…</main>;
  if (user) {
    if (path === '/evaluation/setup') return <EvaluationSetupPage />;
    if (path === '/evaluations') return <EvaluationHistoryPage />;
    const report = /^\/evaluations\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/report$/i.exec(path);
    if (report) return <ReportPage key={report[1]} evaluationId={report[1]} />;
    const evaluation = /^\/evaluations\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(path);
    if (evaluation) return <EvaluationPage key={evaluation[1]} evaluationId={evaluation[1]} />;
    return <HomePage />;
  }
  return path === '/signup' ? <SignupPage /> : <LoginPage />;
}

export function App() {
  return (
    <RenderErrorBoundary>
      <AppProviders>
        <UserSessionProvider>
          <CurrentPage />
        </UserSessionProvider>
      </AppProviders>
    </RenderErrorBoundary>
  );
}
