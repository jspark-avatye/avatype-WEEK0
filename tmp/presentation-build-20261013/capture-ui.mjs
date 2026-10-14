import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const buildDir = path.dirname(new URL(import.meta.url).pathname);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--autoplay-policy=user-gesture-required'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1240, height: 1080 }, deviceScaleFactor: 2 });
  const evaluationId = '11111111-1111-4111-8111-111111111111';
  const account = { userId: '22222222-2222-4222-8222-222222222222', loginId: 'demo', currentLevelCode: null };
  const options = {
    topics: [
      { code: 'DAILY_LIFE', label: '일상', description: '일상과 취미에 관해 이야기합니다.' },
      { code: 'TRAVEL', label: '여행', description: '여행 경험과 계획에 관해 이야기합니다.' },
      { code: 'WORK', label: '직장', description: '업무와 직장 생활에 관해 이야기합니다.' },
    ],
    startingBands: [
      { code: 'BEGINNER', label: '초급' },
      { code: 'INTERMEDIATE', label: '중급' },
      { code: 'ADVANCED', label: '고급' },
    ],
    maximumDurationSeconds: 600,
  };
  const progress = {
    evaluationId, topicCode: 'TRAVEL', startingBandCode: 'INTERMEDIATE', status: 'IN_PROGRESS',
    phase: 'READY_TO_ANSWER', createdAt: new Date().toISOString(), startedAt: new Date().toISOString(),
    pausedAt: null, endedAt: null, expiresAt: null, endReason: null,
    question: { questionId: '33333333-3333-4333-8333-333333333333', questionNo: 1,
      content: 'Tell me about a trip you enjoyed. What made it memorable?',
      difficultyLevelCode: 'INTERMEDIATE_MID', audioId: '44444444-4444-4444-8444-444444444444' },
    latestAnswer: null, errorCode: null, retryAvailable: false, retryAfterAt: null,
    actions: { canRecord: true, canSubmit: true, canPause: true, canResume: false, canEnd: true },
  };
  const wav = Buffer.alloc(16044);
  wav.write('RIFF', 0); wav.writeUInt32LE(16036, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  await page.route('**/trpc/**', async (route) => {
    const rpc = new URL(route.request().url()).pathname.split('/').at(-1);
    let data;
    if (rpc === 'auth.refresh') data = { accessToken: 'sample-ui-token' };
    else if (rpc === 'auth.me') data = account;
    else if (rpc === 'evaluation.options') data = options;
    else if (rpc === 'evaluation.get' || rpc === 'evaluation.start') data = progress;
    else if (rpc === 'evaluation.resumable') data = [];
    else if (rpc === 'evaluation.audio') data = { mimeType: 'audio/wav', audioBase64: wav.toString('base64') };
    else data = {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data } }) });
  });
  await page.goto('http://127.0.0.1:5179/evaluation/setup');
  await page.getByRole('heading', { name: '대화를 준비해 볼까요?' }).waitFor();
  await page.locator('input[value="TRAVEL"]').check();
  await page.locator('input[value="INTERMEDIATE"]').check();
  await page.locator('.evaluation-card').screenshot({ path: path.join(buildDir, 'assets/setup-ui.png') });
  await page.goto(`http://127.0.0.1:5179/evaluations/${evaluationId}`);
  await page.getByText(progress.question.content).waitFor();
  await page.getByRole('button', { name: '질문 듣기' }).click();
  await page.waitForTimeout(1600);
  await page.locator('.question-card').screenshot({ path: path.join(buildDir, 'assets/conversation-ui.png') });
  await fs.writeFile(path.join(buildDir, 'assets/ui-preview-provenance.json'), JSON.stringify({
    type: 'actual_frontend_with_sample_rpc_responses',
    source: 'apps/web/src/pages/evaluation/ui/evaluation-page.tsx',
    note: 'Screenshot shows current frontend code with illustrative sample API responses. It is not evidence of successful AI integration.',
  }, null, 2));
  console.log('Saved two UI previews with sample RPC data.');
} finally { await browser.close(); }
