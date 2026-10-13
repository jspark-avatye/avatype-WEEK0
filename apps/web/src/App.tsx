import { trpc } from './trpc';

export default function App() {
  const health = trpc.health.useQuery(undefined, { retry: false });

  return (
    <main className="page-shell">
      <header className="topbar"><a className="brand" href="/">root<span>.</span></a><span className="status"><i /> English speaking assessment</span></header>
      <section className="hero">
        <p className="eyebrow">SPEAK WITH CONFIDENCE</p>
        <h1>영어로 말하는 실력을<br /><em>제대로 확인해 보세요.</em></h1>
        <p className="intro">실제 대화부터 세밀한 피드백까지, 당신의 영어 회화 성장을 돕습니다.</p>
        <button type="button" className="start-button" disabled>평가 시작하기 <span aria-hidden="true">→</span></button>
        <p className="api-state">API {health.data ? '연결됨' : health.isError ? '연결 대기 중' : '확인 중'}</p>
      </section>
      <footer>대화로 발견하고, 피드백으로 성장합니다.</footer>
    </main>
  );
}
