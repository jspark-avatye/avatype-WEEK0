import { useQuestionAudio } from '@/entities/evaluation';
import { useAudioPlayback } from '@/shared/lib/audio';
import { Button } from '@/shared/ui/button';
import { useEffect, useState } from 'react';
function Playback({ mimeType, audioBase64, reload, onCompleted }: { mimeType: string; audioBase64: string; reload(): void; onCompleted(): void }) {
  const audio = useAudioPlayback(mimeType, audioBase64);
  useEffect(() => { if (audio.state === 'COMPLETED') onCompleted(); }, [audio.state, onCompleted]);
  return <div aria-live="polite">
    {audio.state === 'LOADING' && <p>질문 음성을 준비하고 있습니다…</p>}
    {audio.state === 'PLAYING' && <p>AI가 질문하고 있습니다. 끝까지 들어 주세요.</p>}
    {audio.state === 'BLOCKED' && <><p>버튼을 눌러 질문을 들어 주세요.</p><Button onClick={audio.play}>질문 듣기</Button></>}
    {audio.state === 'ERROR' && <><p className="evaluation-error">질문 음성을 재생하지 못했습니다.</p><Button onClick={reload}>첫 재생 다시 시도</Button></>}
  </div>;
}
export function QuestionPlayer({ audioId, onCompleted }: { audioId: string; onCompleted(): void }) {
  const audio = useQuestionAudio(audioId); const [revision, setRevision] = useState(0);
  if (audio.isPending) return <p role="status">질문 음성을 가져오고 있습니다…</p>;
  if (audio.isError) return <div role="alert"><p className="evaluation-error">질문 음성을 가져오지 못했습니다.</p><Button onClick={() => { void audio.refetch(); }}>음성 다시 가져오기</Button></div>;
  return <Playback key={revision} mimeType={audio.data.mimeType} audioBase64={audio.data.audioBase64} onCompleted={onCompleted} reload={() => {
    void audio.refetch().then((result) => { if (!result.isError) setRevision((value) => value + 1); });
  }} />;
}
