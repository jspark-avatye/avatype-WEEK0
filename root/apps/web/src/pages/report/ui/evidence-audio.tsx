import { useEffect, useRef, useState } from 'react';
import { trpcClient } from '@/shared/api';
import { Button } from '@/shared/ui/button';
export function EvidenceAudio({ evaluationId, answerId }: { evaluationId: string; answerId: string }) {
  const [url, setUrl] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const fileUrl = useRef(''); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (fileUrl.current) URL.revokeObjectURL(fileUrl.current); }; }, []);
  async function load() {
    if (busy) return; setBusy(true); setError('');
    try {
      const audio = await trpcClient.report.answerAudio.query({ evaluationId, answerId });
      if (!audio || typeof audio.audioBase64 !== 'string' || !audio.audioBase64 || !['audio/webm', 'audio/mp4'].includes(audio.mimeType)) throw new Error('답변 음성 정보를 확인할 수 없습니다.');
      const binary = atob(audio.audioBase64); const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      if (bytes.length > 10 * 1024 * 1024) throw new Error('답변 음성 정보를 확인할 수 없습니다.');
      if (!mounted.current) return;
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = URL.createObjectURL(new Blob([bytes], { type: audio.mimeType })); setUrl(fileUrl.current);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '음성을 불러오지 못했습니다.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="evidence-audio">
    {!url && <Button disabled={busy} onClick={() => { void load(); }}>{busy ? '음성을 준비하고 있습니다…' : '답변 음성 듣기'}</Button>}
    {url && <audio controls preload="metadata" src={url} onError={() => { setError('음성을 재생하지 못했습니다.'); URL.revokeObjectURL(fileUrl.current); fileUrl.current = ''; setUrl(''); }} aria-label="근거 답변 전체 음성" />}
    {error && <p role="alert">{error}</p>}
  </div>;
}
