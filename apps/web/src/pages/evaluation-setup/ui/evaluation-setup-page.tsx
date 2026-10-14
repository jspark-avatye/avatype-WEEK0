import { useEvaluationOptions } from '@/entities/evaluation';
import { StartEvaluationForm } from '@/features/start-evaluation';
import { SiteHeader } from '@/widgets/site-header';
import { Button } from '@/shared/ui/button';
import { navigate } from '@/shared/lib/navigate';
import './evaluation-setup.css';

export function EvaluationSetupPage() {
  const options = useEvaluationOptions();
  return (
    <main className="evaluation-page">
      <SiteHeader />
      <section className="evaluation-card">
        <Button onClick={() => navigate('/')}>홈으로</Button>
        <p className="evaluation-eyebrow">YOUR FIRST CONVERSATION</p>
        <h1>대화를 준비해 볼까요?</h1>
        <p className="evaluation-muted">주제와 시작 수준을 선택하고 마이크를 확인해 주세요.</p>
        {options.isPending && <p role="status">평가 설정을 불러오고 있습니다…</p>}
        {options.isError && <div role="alert"><p className="evaluation-error">평가 설정을 불러오지 못했습니다.</p><Button onClick={() => { void options.refetch(); }}>다시 조회</Button></div>}
        {options.data && <StartEvaluationForm options={options.data} />}
      </section>
    </main>
  );
}
