import { useEffect, useState } from 'react';
import { UserSessionProvider, useUserSession } from '@/entities/user';
import { HomePage } from '@/pages/home';
import { LoginPage } from '@/pages/login';
import { SignupPage } from '@/pages/signup';
import { AppProviders } from './providers/app-providers';
import './styles/index.css';

function CurrentPage() {
  const { user, restoring } = useUserSession();
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onLocationChange = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onLocationChange);
    return () => window.removeEventListener('popstate', onLocationChange);
  }, []);

  if (restoring) return <main className="auth-page">인증 상태를 확인하고 있습니다…</main>;
  if (user) return <HomePage />;
  return path === '/signup' ? <SignupPage /> : <LoginPage />;
}

export function App() {
  return (
    <AppProviders>
      <UserSessionProvider>
        <CurrentPage />
      </UserSessionProvider>
    </AppProviders>
  );
}
