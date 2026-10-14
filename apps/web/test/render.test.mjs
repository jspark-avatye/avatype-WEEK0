import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const web = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const { build } = require(createRequire(require.resolve('vite')).resolve('esbuild'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { getQueryKey } = require('@trpc/react-query');
const entries = {
  App: 'app/app.tsx',
  EvaluationPage: 'pages/evaluation/ui/evaluation-page.tsx',
  HomePage: 'pages/home/ui/home-page.tsx',
  LoginPage: 'pages/login/ui/login-page.tsx',
  SignupPage: 'pages/signup/ui/signup-page.tsx',
  EvaluationSetupPage: 'pages/evaluation-setup/ui/evaluation-setup-page.tsx',
  ReportPage: 'pages/report/ui/report-page.tsx',
  EvaluationHistoryPage: 'pages/evaluation-history/ui/evaluation-history-page.tsx',
};

// Keep the real React components, tRPC hooks and QueryClient. Only authenticated
// session state is supplied as a fixture; no network, DOM or browser is required.
const bundled = await build({
  stdin: {
    contents: Object.entries(entries).map(([name, path]) => `export { ${name} } from ${JSON.stringify(resolve(web, 'src', path))};`).join('\n')
      + `\nexport { trpc, trpcClient } from ${JSON.stringify(resolve(web, 'src/shared/api/trpc.ts'))};`
      + `\nexport { parseEvaluationProgress } from ${JSON.stringify(resolve(web, 'src/entities/evaluation/model/progress-response.ts'))};`
      + `\nexport { parseReportProgress, parseReportDocument, parseEvaluationHistory } from ${JSON.stringify(resolve(web, 'src/entities/report/model/report-response.ts'))};`,
    resolveDir: web,
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
  loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' }, alias: { '@': resolve(web, 'src') },
  plugins: [{ name: 'session-fixture', setup(builder) {
    builder.onResolve({ filter: /^@\/entities\/user$/ }, () => ({ path: 'session', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const useUserSession = () => globalThis.renderSession;
      export const UserSessionProvider = ({ children }) => children;
    ` }));
  } }],
});
const componentModule = { exports: {} };
new Script('(function(require,module,exports){' + bundled.outputFiles[0].text + '\n})').runInThisContext()(require, componentModule, componentModule.exports);
const components = componentModule.exports;

const evaluationId = '00000000-0000-4000-8000-000000000001';
function progress(overrides = {}) {
  return {
    evaluationId, topicCode: 'TRAVEL', startingBandCode: 'BEGINNER', status: 'IN_PROGRESS', phase: 'READY_TO_ANSWER',
    createdAt: '2026-10-13T12:00:00Z', startedAt: '2026-10-13T12:00:01Z', pausedAt: null, endedAt: null,
    expiresAt: '2026-10-13T12:10:01Z', endReason: null,
    question: { questionId: 'q', questionNo: 1, content: 'Where would you like to travel?', audioId: 'audio', difficultyLevelCode: 'BEGINNER_MID' },
    latestAnswer: null, errorCode: null, retryAvailable: false, retryAfterAt: null,
    actions: { canRecord: true, canSubmit: true, canPause: true, canResume: false, canEnd: true }, ...overrides,
  };
}
function render(name, { evaluation, resumable = [], report, history } = {}) {
  globalThis.renderSession = { user: { userId: 'owner', loginId: 'demo' }, restoring: false, accept() {}, clear() {}, async refreshProfile() {} };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false, gcTime: Infinity } } });
  client.setQueryData(getQueryKey(components.trpc.health, undefined, 'query'), { status: 'ok' });
  client.setQueryData(getQueryKey(components.trpc.evaluation.resumable, undefined, 'query'), resumable);
  if (evaluation !== undefined) client.setQueryData(getQueryKey(components.trpc.evaluation.get, { evaluationId }, 'query'), evaluation);
  if (report !== undefined) client.setQueryData(getQueryKey(components.trpc.report.get, { evaluationId }, 'query'), report);
  if (history !== undefined) client.setQueryData(getQueryKey(components.trpc.report.history, { page: 1, pageSize: 10 }, 'query'), history);
  const element = React.createElement(components.trpc.Provider, { client: components.trpcClient, queryClient: client },
    React.createElement(QueryClientProvider, { client }, React.createElement(components[name], { evaluationId })));
  try { return renderToStaticMarkup(element); } finally { client.clear(); delete globalThis.renderSession; }
}

test('login, signup, home and evaluation setup render with the actual React components', () => {
  for (const [page, expected] of [['LoginPage', '로그인'], ['SignupPage', '회원가입'], ['HomePage', '평가 시작하기'], ['EvaluationSetupPage', '평가']]) {
    assert.ok(render(page).includes(expected), `${page} did not render`);
  }
});

test('the application entry renders authentication restoration, login and authenticated home', () => {
  const previousWindow = globalThis.window;
  try {
    for (const [session, path, expected] of [
      [{ user: null, restoring: true }, '/', '인증 상태를 확인하고 있습니다'],
      [{ user: null, restoring: false }, '/login', '로그인'],
      [{ user: { userId: 'owner', loginId: 'demo' }, restoring: false }, '/', '평가 시작하기'],
    ]) {
      globalThis.window = { location: { pathname: path } };
      globalThis.renderSession = { ...session, accept() {}, clear() {} };
      assert.ok(renderToStaticMarkup(React.createElement(components.App)).includes(expected));
    }
  } finally {
    delete globalThis.renderSession;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

test('normal evaluation response renders question and controls', () => {
  const html = render('EvaluationPage', { evaluation: progress() });
  assert.ok(html.includes('Where would you like to travel?')); assert.ok(html.includes('잠시 정지')); assert.ok(html.includes('평가 종료'));
});

test('previous first-question response without actions renders an error instead of crashing', () => {
  const previous = { evaluationId, status: 'IN_PROGRESS', phase: 'READY', startedAt: '2026-10-13T12:00:01Z', question: progress().question, errorCode: null, retryAvailable: false };
  const html = render('EvaluationPage', { evaluation: previous });
  assert.ok(html.includes('평가 정보를 불러오지 못했습니다')); assert.ok(html.includes('상태 다시 확인')); assert.ok(!html.includes('평가 종료'));
});

test('missing actions or malformed nested question/answer cannot reach the view as successful data', () => {
  for (const invalid of [progress({ actions: undefined }), progress({ actions: {} }), progress({ question: { content: {} } }), progress({ latestAnswer: [] }), progress({ startedAt: 'bad date' })]) {
    const html = render('EvaluationPage', { evaluation: invalid }); assert.ok(html.includes('평가 정보를 불러오지 못했습니다')); assert.ok(!html.includes('잠시 정지'));
  }
});

test('an invalid resumable-session response does not break the home screen', () => {
  const html = render('HomePage', { resumable: { sessions: [] } });
  assert.ok(html.includes('평가 시작하기')); assert.ok(html.includes('이어서 할 평가 목록을 불러오지 못했습니다'));
});

test('PAUSED and ANALYSIS_PENDING views render valid state controls', () => {
  const paused = render('EvaluationPage', { evaluation: progress({ status: 'PAUSED', pausedAt: '2026-10-13T12:01:00Z', actions: { canRecord: false, canSubmit: false, canPause: false, canResume: true, canEnd: true } }) });
  assert.ok(paused.includes('평가 재개')); assert.ok(!paused.includes('답변 녹음'));
  const ended = render('EvaluationPage', { evaluation: progress({ status: 'ANALYSIS_PENDING', phase: 'FINISHED', question: null, endedAt: '2026-10-13T12:02:00Z', endReason: 'USER_ENDED', actions: { canRecord: false, canSubmit: false, canPause: false, canResume: false, canEnd: false } }) });
  assert.ok(ended.includes('영어 회화가 종료되었습니다')); assert.ok(!ended.includes('잠시 정지'));
});

function reportDocument(verdict = 'CONFIRMED') {
  const insufficient = verdict === 'UNASSESSABLE';
  return { reportId: 'report', evaluationId, verdict, finalLevelCode: insufficient ? null : 'INTERMEDIATE_MID', summary: '실제 답변을 바탕으로 평가했습니다.', createdAt: '2026-10-14T00:00:00Z',
    criteria: ['VOCABULARY', 'GRAMMAR', 'PRONUNCIATION', 'FLUENCY', 'RELEVANCE'].map((criterionCode) => ({ criterionCode, score: insufficient ? null : 70, insufficientReason: insufficient ? '답변 데이터가 부족합니다.' : null, rationale: '발화의 근거를 확인했습니다.',
      evidence: insufficient ? [] : [{ answerId: 'answer', questionId: 'question', question: 'Why do you enjoy working together?', transcript: 'I enjoy sharing ideas with others.', durationMs: 10000, explanation: '구체적인 이유를 제공했습니다.' }],
      feedback: insufficient ? [] : [{ feedbackKind: 'IMPROVEMENT', suggestion: '대안을 비교해 보세요.', explanation: '설명의 깊이를 늘립니다.' }],
    })),
  };
}
function reportProgress(overrides = {}) { return { evaluationId, status: 'COMPLETED', stage: 'COMPLETED', errorCode: null, canStart: false, retryAvailable: false, retryAfterAt: null, report: reportDocument(), ...overrides }; }
test('report renders the five criteria, actual evidence, feedback and verdict for each result kind', () => {
  for (const verdict of ['CONFIRMED', 'PROVISIONAL', 'UNASSESSABLE']) {
    const html = render('ReportPage', { report: reportProgress({ report: reportDocument(verdict) }) });
    for (const name of ['어휘', '문법', '발음', '유창성', '답변 적절성']) assert.ok(html.includes(name));
    assert.ok(html.includes(verdict === 'CONFIRMED' ? '확정' : verdict === 'PROVISIONAL' ? '잠정' : '평가 불가'));
    if (verdict === 'UNASSESSABLE') { assert.ok(html.includes('평가 데이터 부족')); assert.ok(!html.includes('0 / 100')); }
    else { assert.ok(html.includes('I enjoy sharing ideas with others.')); assert.ok(html.includes('개선 피드백')); }
  }
});
test('pending and failed reports show state and retry controls without rendering a premature result', () => {
  const pending = render('ReportPage', { report: reportProgress({ status: 'ANALYSIS_PENDING', stage: 'NOT_STARTED', report: null, canStart: true }) });
  assert.ok(pending.includes('보고서 분석 시작')); assert.ok(!pending.includes('70 / 100'));
  const failed = render('ReportPage', { report: reportProgress({ status: 'ANALYSIS_FAILED', stage: 'FAILED', report: null, errorCode: 'AI_TIMEOUT', retryAvailable: true }) });
  assert.ok(failed.includes('분석 재시도')); assert.ok(failed.includes('대기 시간이 초과'));
});
test('malformed report shapes, score/level and duplicate criteria render an error instead of crashing', () => {
  for (const change of [(r) => { r.criteria.pop(); }, (r) => { r.criteria[0].score = 101; }, (r) => { r.criteria[0].evidence[0].transcript = {}; }, (r) => { r.criteria[1].criterionCode = r.criteria[0].criterionCode; }, (r) => { r.finalLevelCode = 'UNKNOWN'; }]) {
    const report = reportDocument(); change(report); const html = render('ReportPage', { report: reportProgress({ report }) });
    assert.ok(html.includes('보고서 정보를 불러오지 못했습니다')); assert.ok(!html.includes('70 / 100'));
  }
});
test('history shows own status/verdict and handles empty/malformed responses', () => {
  const history = { page: 1, pageSize: 10, total: 1, items: [{ evaluationId, topicCode: 'WORK', createdAt: '2026-10-14T00:00:00Z', startedAt: '2026-10-14T00:00:01Z', status: 'COMPLETED', finalLevelCode: 'INTERMEDIATE_MID', verdict: 'CONFIRMED' }] };
  assert.ok(render('EvaluationHistoryPage', { history }).includes('보고서 확인'));
  assert.ok(render('EvaluationHistoryPage', { history: { ...history, items: [], total: 0 } }).includes('아직 평가 기록이 없습니다'));
  assert.ok(render('EvaluationHistoryPage', { history: { items: null } }).includes('평가 기록을 불러오지 못했습니다'));
});
test('report response parser runs in a browser bundle without evaluating server-only tRPC initialization', async () => {
  const bundle = await build({ entryPoints: [resolve(web, 'src/entities/report/model/report-response.ts')], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'ReportParsers' });
  const sandbox = { window: {}, console };
  new Script(bundle.outputFiles[0].text).runInNewContext(sandbox);
  assert.equal(sandbox.ReportParsers.parseReportDocument(reportDocument()).verdict, 'CONFIRMED');
});
