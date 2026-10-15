import { useResumableEvaluations } from '@/entities/evaluation';
import { levelLabel } from '@/entities/report';
import { useUserSession } from '@/entities/user';
import { SiteHeader } from '@/widgets/site-header';
import { Button } from '@/shared/ui/button';
import { navigate } from '@/shared/lib/navigate';
import { useApiHealth } from '../api/use-api-health';
import './home-page.css';

export function HomePage() {
  const health = useApiHealth();
  const paused = useResumableEvaluations();
  const { user } = useUserSession();

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
        <Button onClick={() => navigate('/evaluation/setup')}>
          평가 시작하기 <span className="home-page__start-icon" aria-hidden="true">→</span>
        </Button>
        <p className="home-page__api-state">
          {user?.currentLevelCode && <>현재 수준: {levelLabel(user.currentLevelCode)} · </>}
          API {health.data ? '연결됨' : health.isError ? '연결 대기 중' : '확인 중'}
        </p>
      </section>
      <Button onClick={() => navigate('/evaluations')}>내 평가 기록</Button>
      {!paused.isError && paused.data && paused.data.length > 0 && <section aria-label="정지한 평가">
        <h2>정지한 평가 이어서 하기</h2>
        {paused.data.map((evaluation) => <p key={evaluation.evaluationId}>
          {evaluation.topicCode} · {evaluation.expiresAt && new Date(evaluation.expiresAt).toLocaleTimeString()}까지{' '}
          <Button onClick={() => navigate(`/evaluations/${evaluation.evaluationId}`)}>이어서 하기</Button>
        </p>)}
      </section>}
      {paused.isError && <p role="alert">이어서 할 평가 목록을 불러오지 못했습니다. <Button onClick={() => { void paused.refetch(); }}>다시 확인</Button></p>}
      <footer className="home-page__footer">대화로 발견하고, 피드백으로 성장합니다.</footer>
    </main>
  );
}
