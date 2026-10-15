import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { EvaluationOptions, StartingBandCode, TopicCode } from '@/entities/evaluation';
import { trpcClient } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { checkMicrophone, microphoneErrorMessage } from '@/shared/lib/audio';
import { navigate } from '@/shared/lib/navigate';

export function StartEvaluationForm({ options }: { options: EvaluationOptions }) {
  const [topicCode, setTopicCode] = useState<TopicCode | ''>('');
  const [startingBandCode, setStartingBandCode] = useState<StartingBandCode | ''>('');
  const [microphone, setMicrophone] = useState<'IDLE' | 'CHECKING' | 'READY' | 'FAILED'>('IDLE');
  const [microphoneError, setMicrophoneError] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const evaluationId = useRef<string | null>(null);
  const submitting = useRef(false);
  const checking = useRef(false);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function verifyMicrophone() {
    if (checking.current) return;
    checking.current = true;
    setMicrophone('CHECKING');
    setMicrophoneError('');
    try {
      await checkMicrophone();
      if (mounted.current) setMicrophone('READY');
    } catch (error) {
      if (mounted.current) { setMicrophone('FAILED'); setMicrophoneError(microphoneErrorMessage(error)); }
    } finally { checking.current = false; }
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!topicCode || !startingBandCode || microphone !== 'READY' || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    evaluationId.current ??= crypto.randomUUID();
    try {
      const result = await trpcClient.evaluation.create.mutate({ evaluationId: evaluationId.current, topicCode, startingBandCode });
      if (mounted.current) navigate(`/evaluations/${result.evaluationId}`);
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : '평가를 생성하지 못했습니다. 다시 시도해 주세요.'); }
    finally { submitting.current = false; if (mounted.current) setPending(false); }
  }

  return (
    <form className="evaluation-form" onSubmit={(event) => { void start(event); }}>
      <fieldset disabled={pending}>
        <legend>어떤 주제로 이야기할까요?</legend>
        <div className="evaluation-options">
          {options.topics.map((topic) => (
            <label className={`evaluation-option ${topicCode === topic.code ? 'evaluation-option--selected' : ''}`} key={topic.code}>
              <input type="radio" name="topic" value={topic.code} checked={topicCode === topic.code} onChange={() => { setTopicCode(topic.code); evaluationId.current = null; setError(''); }} />
              <strong>{topic.label}</strong><span>{topic.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={pending}>
        <legend>시작 수준을 선택해 주세요</legend>
        <p className="evaluation-muted">첫 질문의 난이도입니다. 최종 평가 수준을 제한하지 않습니다.</p>
        <div className="evaluation-options">
          {options.startingBands.map((band) => (
            <label className={`evaluation-option ${startingBandCode === band.code ? 'evaluation-option--selected' : ''}`} key={band.code}>
              <input type="radio" name="band" value={band.code} checked={startingBandCode === band.code} onChange={() => { setStartingBandCode(band.code); evaluationId.current = null; setError(''); }} />
              <strong>{band.label}</strong>
            </label>
          ))}
        </div>
      </fieldset>
      <section className="evaluation-notice" aria-label="평가 안내">
        <h2>시작하기 전에</h2>
        <ul>
          <li>AI 질문을 듣고 영어로 답변합니다. 녹음한 답변은 보내기 버튼으로 제출합니다.</li>
          <li>평가 중에는 힌트·교정·다시 듣기를 제공하지 않습니다.</li>
          <li>평가는 첫 질문 음성 준비 완료부터 최대 {options.maximumDurationSeconds / 60}분이며, 일시정지 시간도 포함됩니다.</li>
          <li>질문 음성은 AI가 생성합니다.</li>
        </ul>
      </section>
      <div className="evaluation-microphone">
        <Button disabled={microphone === 'CHECKING' || pending} onClick={() => { void verifyMicrophone(); }}>
          {microphone === 'CHECKING' ? '마이크 확인 중…' : microphone === 'READY' ? '마이크 다시 확인' : '마이크 확인'}
        </Button>
        <p role="status">{microphone === 'READY' ? '마이크 사용 가능' : '평가 시작 전에 마이크를 확인해 주세요.'}</p>
      </div>
      {microphoneError && <p role="alert" className="evaluation-error">{microphoneError}</p>}
      {error && <p role="alert" className="evaluation-error">{error}</p>}
      <Button type="submit" disabled={!topicCode || !startingBandCode || microphone !== 'READY' || pending}>
        {pending ? '평가 생성 중…' : '평가 시작하기'}
      </Button>
    </form>
  );
}
