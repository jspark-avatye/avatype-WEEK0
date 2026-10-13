import { SignOutButton } from '@/features/sign-out';
import { useUserSession } from '@/entities/user';
import './site-header.css';

export function SiteHeader() {
  const { user } = useUserSession();
  return (
    <header className="site-header">
      <a className="site-header__brand" href="/">root<span>.</span></a>
      <span className="site-header__status"><i /> {user?.loginId} <SignOutButton /></span>
    </header>
  );
}
