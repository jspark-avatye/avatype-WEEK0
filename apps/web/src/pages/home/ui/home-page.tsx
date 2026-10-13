import { SiteHeader } from '@/widgets/site-header';
import { Button } from '@/shared/ui/button';
import { useApiHealth } from '../api/use-api-health';
import './home-page.css';

export function HomePage() {
  const health = useApiHealth();

  return (
    <main className="home-page">
      <SiteHeader />
      <section className="home-page__hero">
        <p className="home-page__eyebrow">SPEAK WITH CONFIDENCE</p>
        <h1 className="home-page__title">
          영어로 말하는 실력을<br /><em>제대로 확인해 보세요.</em>
        </h1>
        <p className="home-page__intro">
          실제 대화부터 세밀한 피드백까지, 당신의 영어 회화 성장을 돕습니다.
        </p>
        <Button disabled>
          평가 시작하기 <span className="home-page__start-icon" aria-hidden="true">→</span>
        </Button>
        <p className="home-page__api-state">
          API {health.data ? '연결됨' : health.isError ? '연결 대기 중' : '확인 중'}
        </p>
      </section>
      <footer className="home-page__footer">대화로 발견하고, 피드백으로 성장합니다.</footer>
    </main>
  );
}
