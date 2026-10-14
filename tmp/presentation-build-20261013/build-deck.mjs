import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const BUILD = path.dirname(fileURLToPath(import.meta.url));
const FONT = 'Apple SD Gothic Neo';
const C = { paper: '#F7F5F0', ink: '#18343F', teal: '#0B756D', muted: '#5D727A', pale: '#E7EFEB', white: '#FFFFFF', rule: '#CFD9D4' };
const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function text(slide, name, content, x, y, w, h, size = 28, color = C.ink, bold = false, extra = {}) {
  const shape = slide.shapes.add({ geometry: 'textbox', name, position: { left: x, top: y, width: w, height: h }, fill: 'none', line: { fill: 'none', width: 0 } });
  shape.text = content;
  shape.text.style = { typeface: FONT, fontSize: size, color, bold, insets: 0, autoFit: 'none', wrap: 'square', verticalAlignment: 'top', ...extra };
  return shape;
}

function addSlide(title, number, dark = false) {
  const slide = presentation.slides.add();
  slide.background.fill = dark ? C.ink : C.paper;
  if (title) text(slide, `slide-${number}-title`, title, 72, 58, 1136, 72, 46, dark ? C.white : C.ink, true);
  if (number > 1) text(slide, `slide-${number}-page`, String(number).padStart(2, '0'), 1158, 664, 50, 28, 18, dark ? '#B5D4CD' : C.muted, false, { alignment: 'right' });
  return slide;
}

function node(slide, name, title, x, y, w, h, fill = C.white, lineColor = C.rule, size = 27) {
  const shape = slide.shapes.add({ geometry: 'rect', name, position: { left: x, top: y, width: w, height: h }, fill, line: { fill: lineColor, width: 1.5 } });
  shape.text = title;
  shape.text.style = { typeface: FONT, fontSize: size, color: C.ink, bold: true, alignment: 'center', verticalAlignment: 'middle', insets: 14, autoFit: 'none' };
  return shape;
}

function link(slide, from, to, options = {}) {
  return slide.shapes.connect(from, to, { kind: 'straight', fromSide: 'right', toSide: 'left', line: { fill: C.teal, width: 2 }, tail: { type: 'arrow', width: 'med', length: 'med' }, ...options });
}

async function picture(slide, filename, alt, x, y, w, h, fit = 'contain') {
  const bytes = await fs.readFile(path.join(BUILD, 'assets', filename));
  return slide.images.add({ blob: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), contentType: 'image/png', alt, fit, position: { left: x, top: y, width: w, height: h } });
}

function notes(slide, speakingText, sources) {
  slide.speakerNotes.text = `${speakingText}\n\n근거 자료\n${sources.join('\n')}`;
}

// 1. Introduction and the design problem.
{
  const s = addSlide(null, 1);
  await picture(s, 'voice-conversation-cover.png', '영어 음성 대화 프로젝트를 표현하는 헤드셋 콘셉트 이미지', 780, 0, 500, 720, 'cover');
  text(s, 'cover-brand', 'root.', 72, 66, 600, 120, 94, C.teal, true);
  text(s, 'cover-title', 'AI 음성 대화 기반\n영어 회화 평가', 72, 258, 690, 184, 58, C.ink, true);
  text(s, 'cover-context', '2일 사내 해커톤 · 웹 프로젝트', 76, 478, 670, 52, 27, C.muted);
  text(s, 'cover-background', '개발 배경\n대화 기록을 바탕으로 수준과 개선점을 확인하는 경험', 76, 580, 670, 80, 23, C.muted);
  notes(s, '[약 1분]\n이번 프로젝트는 AI와 음성으로 대화하며 영어 회화 수준을 평가하는 웹 서비스 root입니다. 개발의 출발점은 사용자의 실제 답변을 모으고, 그 답변을 근거로 수준과 개선점을 확인하는 경험을 만드는 것입니다. 2일 사내 해커톤이라는 제약 안에서 회화 흐름을 우선 구현하고, 이후 보고서 분석으로 이어지는 구조를 잡았습니다. 오늘은 사용자 흐름을 먼저 보여드린 뒤, 음성 처리 구조와 실패 상황을 다루기 위한 설계 선택을 설명하겠습니다. 현재 구현 범위와 다음 단계도 마지막에 구분해 말씀드리겠습니다.\n표지 이미지는 생성한 콘셉트 이미지입니다.', ['docs/product/PRD.md', 'README.md', '표지 이미지: ImageGen 생성 콘셉트 이미지, 2026-10-13']);
}

// 2. Product goals, available choices and report scope.
{
  const s = addSlide('목표와 핵심 기능', 2);
  text(s, 'goal-statement', '대화 기록을 근거로\n회화 수준을 평가합니다', 72, 170, 740, 138, 46, C.ink, true);
  text(s, 'goal-setup-heading', '주제와 시작 수준 선택', 76, 354, 690, 44, 29, C.teal, true);
  text(s, 'goal-setup-body', '일상·여행·직장과 초급·중급·고급 중 선택', 76, 406, 720, 48, 27);
  text(s, 'goal-conversation-heading', '답변에 맞춘 후속 대화', 76, 481, 690, 44, 29, C.teal, true);
  text(s, 'goal-conversation-body', '음성 답변을 전사하고, 대화 맥락으로 다음 질문 생성', 76, 535, 710, 88, 27);
  text(s, 'goal-report-label', '보고서 목표', 910, 178, 280, 42, 28, C.teal, true);
  text(s, 'goal-report-criteria', '어휘\n문법\n발음\n유창성\n답변 적절성', 910, 241, 280, 285, 32, C.ink, true);
  text(s, 'goal-report-detail', '최종 수준과 판단 근거\n개선 피드백 제공', 910, 543, 280, 80, 24, C.muted);
  notes(s, '[약 1분]\n사용자는 일상, 여행, 직장 중 주제를 고르고 초급, 중급, 고급 중 첫 질문의 시작 수준을 선택합니다. 시작 수준은 첫 질문의 난이도에만 사용하며 최종 수준을 제한하지 않습니다. AI는 사용자의 음성 답변을 텍스트로 전사하고 이전 대화와 함께 다음 질문을 만듭니다. 평가 중에는 힌트나 표현 교정을 제공하지 않고 질문과 답변에 집중하도록 설계했습니다. 서비스의 최종 목표는 어휘, 문법, 발음, 유창성, 답변 적절성의 다섯 항목과 최종 수준, 실제 답변에 연결된 근거, 개선 피드백을 보고서로 제공하는 것입니다. 보고서 생성은 다음 구현 단계입니다.', ['docs/product/PRD.md', 'docs/engineering/implementation_roadmap.md: 최종 평가', 'apps/api/src/module/evaluation/infrastructure/evaluation-config.ts', 'apps/web/src/features/start-evaluation/ui/start-evaluation-form.tsx']);
}

// 3. User journey and actual UI rendered with clearly labelled sample data.
{
  const s = addSlide('사용자 흐름과 시연', 3);
  const steps = [
    ['01', '로그인과 평가 준비', '주제·시작 수준 선택, 마이크 확인'],
    ['02', '질문 듣기와 음성 답변', 'AI 질문 재생 후 녹음·제출'],
    ['03', '후속 대화와 진행 제어', '다음 질문, 일시정지·재개'],
    ['04', '대화 종료', '답변 저장을 마치고 분석 대기'],
  ];
  steps.forEach(([number, title, body], i) => {
    const y = 178 + i * 105;
    text(s, `journey-${number}-number`, number, 76, y, 70, 44, 30, C.teal, true);
    text(s, `journey-${number}-heading`, title, 159, y, 440, 44, 29, C.ink, true);
    text(s, `journey-${number}-body`, body, 159, y + 45, 450, 44, 23, C.muted);
  });
  await picture(s, 'conversation-ui.png', '현재 회화 화면 코드에 샘플 API 응답을 넣은 UI 예시', 659, 171, 549, 440);
  text(s, 'journey-ui-caption', '현재 화면 코드 · 샘플 API 응답', 659, 625, 549, 32, 20, C.muted, false, { alignment: 'center' });
  notes(s, '[약 2분, 시연 포함]\n이 슬라이드는 실제 프런트엔드 코드를 샘플 API 응답으로 렌더링한 UI 예시입니다. 화면의 영어 질문은 예시이며 실제 AI 호출 성공을 증명하는 캡처는 아닙니다.\n시연 순서: 1. 사전 실행한 실제 서비스에서 로그인합니다. 2. 여행과 중급을 선택하고 마이크를 확인합니다. 3. 평가를 시작해 첫 질문 음성을 듣습니다. 4. 영어로 짧게 답변을 녹음하고 제출합니다. 5. 음성 인식, 질문 생성, 음성 합성의 진행 상태와 다음 질문을 확인합니다. 6. 남은 시간에 따라 일시정지와 재개를 보여주거나 평가를 종료합니다.\n예시 답변: I enjoyed a trip to Busan with my friends. We visited the beach and tried local food.\n대화 종료 시 현재 도착 지점은 ANALYSIS_PENDING입니다. 아직 보고서가 생성된 상태로 설명하지 않습니다. 실제 시연이 준비되지 않았다면 이 UI 예시와 처리 흐름으로 설명합니다.', ['apps/web/src/pages/evaluation/ui/evaluation-page.tsx', 'apps/web/src/features/submit-voice-answer/ui/voice-answer.tsx', 'apps/web/src/features/control-evaluation/', 'tmp/presentation-build-20261013/assets/ui-preview-provenance.json']);
}

// 4. Editable architecture diagram, covering request and external adapter boundaries.
{
  const s = addSlide('시스템 아키텍처', 4);
  const web = node(s, 'architecture-web', 'React Web\n브라우저', 72, 196, 240, 104);
  const inbound = node(s, 'architecture-inbound', 'tRPC · Controller\n입력·인증 경계', 376, 196, 270, 104);
  const app = node(s, 'architecture-inner', 'NestJS WAS\nService · Domain · Worker', 710, 196, 498, 104, C.pale, C.teal);
  link(s, web, inbound); link(s, inbound, app);
  text(s, 'architecture-contract', '공유 TypeScript 계약', 77, 321, 570, 35, 23, C.muted);
  text(s, 'architecture-port-label', '포트와 어댑터로 외부 연동', 710, 322, 498, 35, 23, C.teal, true);
  const externals = [
    ['postgres', 'PostgreSQL', '회원·세션·질문·답변'],
    ['minio', 'MinIO 호환 저장소', '질문·답변 음성 원본'],
    ['bullmq', 'Redis · BullMQ', '작업 상태·재시도'],
    ['ai', 'OpenAI', 'STT·질문 생성·TTS'],
  ];
  externals.forEach(([id, title, body], i) => {
    const x = 72 + i * 294;
    const external = node(s, `architecture-${id}`, title, x, 426, 254, 83, C.white, C.rule, 25);
    link(s, app, external, { fromSide: 'bottom', toSide: 'top', kind: 'elbow' });
    text(s, `architecture-${id}-purpose`, body, x, 522, 254, 53, 22, C.muted, false, { alignment: 'center' });
  });
  text(s, 'architecture-fe-rule', 'FE는 FSD 계층과 공개 API로 화면·사용자 동작·업무 모델을 분리', 76, 597, 1132, 34, 24);
  text(s, 'architecture-be-rule', 'Controller는 인바운드 포트 호출, Service는 아웃바운드 포트로 외부 연동', 76, 635, 1090, 38, 23);
  notes(s, '[약 1분 30초]\n전체 구조는 TypeScript 모노레포입니다. React와 NestJS가 공유 tRPC 계약을 사용하고, 브라우저 요청은 tRPC와 Controller를 거쳐 애플리케이션 내부로 들어갑니다. Controller가 저장소를 직접 호출하지 않고 인바운드 포트를 통해 유스케이스를 실행합니다. Service와 Domain은 외부 SDK를 직접 알지 않고, 아웃바운드 포트와 어댑터를 통해 DB, 음성 저장소, 큐, AI를 사용합니다.\nPostgreSQL은 회원과 세션, 질문, 답변의 원본 상태를 저장합니다. 음성 파일은 MinIO 호환 저장소에 두고 DB에는 객체 키를 저장합니다. Redis와 BullMQ는 작업 상태와 제한된 재시도를 맡습니다. Worker는 현재 별도 서버가 아니라 같은 WAS 프로세스에서 실행합니다. FE는 FSD 계층과 슬라이스의 공개 API를 따릅니다. 이 분리는 AI나 저장소 구현이 바뀌더라도 내부 유스케이스 계약을 유지하기 위한 선택입니다.', ['docs/engineering/architecture.md', 'apps/web/src/README.md', 'apps/api/src/module/evaluation/evaluation.controller.ts', 'apps/api/src/module/evaluation/evaluation.module.ts', 'packages/trpc-contract/src/evaluation.ts']);
}

// 5. Editable audio processing sequence.
{
  const s = addSlide('음성 답변 처리 흐름', 5);
  const stages = [
    ['접수', '녹음·제출', '답변 음성 원본과\n답변 정보를 저장'],
    ['인식', 'STT', '영어 음성을 전사하고\n전사문을 저장'],
    ['생성', 'LLM', '이전 대화로 다음 질문과\n난이도를 결정'],
    ['합성', 'TTS', '질문 MP3를 저장하고\n브라우저에서 재생'],
  ];
  let previous;
  stages.forEach(([label, title, body], i) => {
    const x = 72 + i * 294;
    text(s, `audio-stage-${i}-label`, label, x, 174, 250, 36, 23, C.teal, true);
    const stage = node(s, `audio-stage-${i}`, title, x, 225, 254, 112, i === 0 ? C.pale : C.white, i === 0 ? C.teal : C.rule, 33);
    if (previous) link(s, previous, stage);
    previous = stage;
    text(s, `audio-stage-${i}-body`, body, x, 363, 254, 87, 24, C.muted);
  });
  text(s, 'audio-async-title', '파일 접수와 AI 처리를 분리', 76, 493, 1128, 49, 34, C.ink, true);
  text(s, 'audio-async-body', '접수 후 큐에 작업을 등록하고, 처리 중에 진행 상태를 조회합니다.\n저장한 대화 기록은 다음 질문과 향후 보고서 분석의 입력이 됩니다.', 76, 553, 1128, 90, 27);
  notes(s, '[약 1분 30초]\n한 번의 답변은 하나의 음성 파일로 제출합니다. 서버는 파일과 답변 정보를 저장하고 큐에 처리 작업을 등록합니다. Worker가 저장소에서 원본 파일을 읽어 STT로 전사한 다음, 주제와 이전 질문, 전사된 답변을 LLM에 전달합니다. LLM은 다음 질문과 난이도 또는 종료 제안을 반환하고, 서버가 형식과 난이도 조건을 확인합니다. 확정한 질문 문자열로 TTS를 수행해 MP3를 저장하고 브라우저가 이를 재생합니다.\n브라우저는 파일 접수 요청을 열어둔 채 모든 AI 처리를 기다리는 방식 대신, 처리 중에 현재 단계를 조회합니다. 사용자에게는 전사 중, 질문 생성 중, 음성 합성 중이라는 상태가 보입니다. 전사문과 원본 음성을 보존하는 이유는 다음 질문을 만들기 위해서이며, 이후 보고서 분석에서도 실제 답변을 근거로 사용할 수 있도록 하기 위해서입니다. 발음 평가를 전사문만으로 완료했다고 가정하지 않습니다.', ['apps/api/src/module/evaluation/application/evaluation.service.ts', 'apps/api/src/module/evaluation/application/conversation.service.ts', 'apps/api/src/module/evaluation/infrastructure/openai-conversation.gateway.ts', 'apps/web/src/entities/evaluation/api/queries.ts', 'docs/engineering/conversation_implementation_plan.md']);
}

// 6. Two design decisions, expressed as a flat comparison rather than UI panels.
{
  const s = addSlide('주요 설계 결정', 6, true);
  text(s, 'decision-delay-label', 'AI 처리 지연', 76, 182, 500, 44, 27, '#94C9BE', true);
  text(s, 'decision-delay-title', '큐와 진행 상태 조회', 76, 244, 520, 64, 39, C.white, true);
  text(s, 'decision-delay-body', '파일 접수 후 작업을 등록합니다.\n전사·질문 생성·음성 합성의\n현재 단계를 화면에 표시합니다.', 76, 340, 510, 177, 28, '#DBE7E4');
  text(s, 'decision-retry-label', '실패와 중복 요청', 684, 182, 520, 44, 27, '#94C9BE', true);
  text(s, 'decision-retry-title', '확정 결과 재사용', 684, 244, 520, 64, 39, C.white, true);
  text(s, 'decision-retry-body', '저장된 전사문과 질문은 재사용합니다.\nTTS 실패 시 확정 질문으로 재시도하고,\nDB 제약으로 중복 답변을 제한합니다.', 684, 340, 520, 177, 28, '#DBE7E4');
  text(s, 'decision-impact', '다시 처리할 범위를 줄이고, 대화의 확정 상태를 유지', 76, 584, 1128, 61, 33, C.white, true);
  notes(s, '[약 2분]\n첫 번째 고민은 처리 시간이 다른 외부 AI 단계를 어떻게 사용자에게 보여줄 것인가였습니다. 음성 파일 접수와 AI 작업 실행을 분리하고, BullMQ Worker가 처리하도록 구성했습니다. 화면은 처리 중에 진행 상태를 조회해서 기다리는 이유를 알려줍니다. 현재는 하나의 WAS 안에서 Worker를 실행하므로 별도 AI 서버나 실시간 스트리밍까지 구조를 확장하지 않았습니다.\n두 번째 고민은 중간 단계가 실패했을 때 이미 성공한 결과를 어떻게 보존할 것인가였습니다. STT 전사문과 생성한 질문을 단계별로 저장합니다. TTS만 실패하면 저장된 질문을 다시 음성으로 만들며, 이미 확정한 질문을 다시 생성하지 않습니다. 질문과 답변의 관계에는 유일성 제약을 두어 중복 제출을 제한합니다. 새 음성을 저장한 뒤 DB 확정에 실패한 경우에는 사용되지 않는 새 객체를 보상 삭제하는 경로도 둡니다.\n이 설계는 모든 외부 작업을 한 번에 다시 수행하는 비용을 줄이고, 사용자가 재시도해도 대화 상태가 일관되게 이어지도록 하기 위한 것입니다. 성능이나 비용 개선 수치는 아직 측정하지 않았으므로 정량 결과로 제시하지 않습니다.', ['apps/api/src/module/evaluation/application/conversation.service.ts', 'apps/api/src/module/evaluation/application/evaluation.service.ts', 'apps/api/src/module/evaluation/infrastructure/prisma-evaluation.repository.ts', 'packages/database/prisma/schema.prisma', 'apps/api/src/module/evaluation/infrastructure/bullmq-conversation.queue.ts']);
}

// 7. Honest implementation scope and the next user-visible milestone.
{
  const s = addSlide('현재 구현 범위와 다음 단계', 7);
  text(s, 'scope-current-label', '코드에 연결한 범위', 76, 184, 560, 47, 28, C.teal, true);
  text(s, 'scope-current-body', '인증과 평가 설정\n음성 답변·STT·후속 질문·TTS\n일시정지·재개·종료·재시도', 76, 253, 576, 212, 30, C.ink, true);
  text(s, 'scope-current-state', '대화 종료 시 분석 대기 상태로 전환', 76, 481, 576, 77, 26, C.muted);
  text(s, 'scope-next-label', '다음 단계', 742, 184, 466, 47, 28, C.teal, true);
  text(s, 'scope-next-body', '최종 수준과 5개 항목 보고서\n답변 근거와 개선 피드백\n실제 음성 평가 전체 흐름 검증', 742, 253, 466, 224, 30, C.ink, true);
  text(s, 'scope-validation', '마이크·AI 연동·재생을 실제 환경에서 확인', 742, 481, 466, 77, 26, C.muted);
  text(s, 'scope-closing', '다음 목표는 대화 기록에서 평가 근거까지 연결하는 것', 76, 604, 1128, 61, 34, C.ink, true);
  notes(s, '[약 1분]\n현재 코드에는 인증, 평가 설정, 음성 답변 제출, STT와 후속 질문, TTS, 일시정지와 재개, 종료, 재시도 흐름이 연결되어 있습니다. 이는 소스 코드에서 확인한 범위이며 실제 외부 서비스와 전체 시나리오가 통과했다는 검증 결과를 의미하지 않습니다. 현재 대화 종료 지점은 분석 대기 상태입니다.\n다음 단계는 저장된 질문과 답변, 전사문, 원본 음성을 분석해 최종 수준과 다섯 항목의 평가 보고서를 만드는 것입니다. 보고서에는 실제 답변을 근거로 한 판단과 개선 피드백을 포함할 계획입니다. 그리고 실제 마이크와 AI, 음성 재생을 사용해 처음부터 끝까지 평가를 완료하는 흐름을 검증해야 합니다. 다음 목표는 회화가 이어지는 경험을 실제 평가 근거와 보고서까지 연결하는 것입니다. 감사합니다.', ['apps/web/src/pages/evaluation/ui/evaluation-page.tsx', 'packages/trpc-contract/src/evaluation.ts', 'apps/api/src/module/evaluation/application/evaluation.service.ts', 'apps/api/src/module/evaluation/application/conversation.service.ts', 'docs/engineering/implementation_roadmap.md: 최종 평가·완료 검증']);
}

const renderDir = path.join(BUILD, 'renders');
await fs.mkdir(renderDir, { recursive: true });
for (const [index, slide] of presentation.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, '0')}`;
  const png = await presentation.export({ slide, format: 'png', scale: 1.5 });
  await fs.writeFile(path.join(renderDir, `${stem}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: 'layout' });
  await fs.writeFile(path.join(renderDir, `${stem}.layout.json`), await layout.text());
}
await (await PresentationFile.exportPptx(presentation)).save(path.join(BUILD, 'candidate.pptx'));
await fs.writeFile(path.join(BUILD, 'deck.proto.json'), JSON.stringify(presentation.toProto()));
await fs.writeFile(path.join(BUILD, 'deck-inspection.ndjson'), (await presentation.inspect({ kind: 'slide,textbox,shape,image,notes', maxChars: 100000 })).ndjson);
console.log(`Exported ${presentation.slides.items.length} slides to candidate.pptx and individual previews.`);
