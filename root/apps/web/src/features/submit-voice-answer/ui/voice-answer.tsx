import { useState } from 'react';
import { trpcClient } from '@/shared/api';
import { useAudioRecorder } from '@/shared/lib/audio';
import { Button } from '@/shared/ui/button';
export function VoiceAnswer({ evaluationId, questionId, enabled, onSent }: { evaluationId: string; questionId: string; enabled: boolean; onSent(): Promise<unknown> }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const recording = useAudioRecorder(enabled);
  async function send() {
    if (!recording.blob || uploading) return;
    const form = new FormData(); form.set('evaluationId', evaluationId); form.set('questionId', questionId);
    form.set('audio', recording.blob, recording.blob.type.startsWith('audio/webm') ? 'answer.webm' : 'answer.mp4');
    setUploading(true); setError('');
    try { await trpcClient.evaluation.submitAnswer.mutate(form); recording.cancel(); }
    catch (error) { setError(error instanceof Error ? error.message : '답변을 보내지 못했습니다.'); }
    finally { await onSent(); setUploading(false); }
  }
  return <section className="voice-answer" aria-label="음성 답변">
    <p>1~120초 동안 영어로 답변한 뒤 보내 주세요.</p>
    {(recording.error || error) && <p role="alert" className="evaluation-error">{recording.error || error}</p>}
    {recording.state === 'RECORDING' && <p role="status">녹음 중 · {recording.seconds}초 / 120초</p>}
    {recording.state === 'RECORDED' && <p>녹음을 마쳤습니다. 보내기 전 다시 녹음할 수 있습니다.</p>}
    {uploading ? <p role="status">답변을 저장하고 있습니다…</p> : <div className="evaluation-actions">
      <Button disabled={!enabled || recording.state === 'REQUESTING' || recording.state === 'RECORDING'} onClick={() => { void recording.start(); }}>{recording.blob ? '다시 녹음' : '답변 녹음'}</Button>
      {recording.state === 'RECORDING' && <Button onClick={recording.stop}>녹음 완료</Button>}
      {(recording.state === 'RECORDING' || recording.blob) && <Button onClick={recording.cancel}>녹음 취소</Button>}
      <Button disabled={!enabled || !recording.blob} onClick={() => { void send(); }}>답변 보내기</Button>
    </div>}
  </section>;
}
