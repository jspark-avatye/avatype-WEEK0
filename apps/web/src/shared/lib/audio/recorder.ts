export function createRecording(callbacks: { onStarted(): void; onComplete(blob: Blob): void; onError(message: string): void; onSeconds(seconds: number): void }) {
  let cancelled = false; let recorder: MediaRecorder | null = null; let stream: MediaStream | null = null;
  let limit: ReturnType<typeof setTimeout> | undefined; let tick: ReturnType<typeof setInterval> | undefined;
  function release() {
    clearTimeout(limit); clearInterval(tick);
    stream?.getTracks().forEach((track) => track.stop()); stream = null;
  }
  function cancel() {
    cancelled = true;
    if (recorder) { recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null; if (recorder.state === 'recording') recorder.stop(); }
    recorder = null; release();
  }
  async function start() {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'].find((mime) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime));
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) throw new Error('이 브라우저는 음성 녹음을 지원하지 않습니다.');
    const media = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
    stream = media; recorder = new MediaRecorder(media, { mimeType });
    const recording = recorder; const chunks: Blob[] = []; let size = 0; const began = performance.now();
    recording.ondataavailable = (event) => {
      if (cancelled) return;
      chunks.push(event.data); size += event.data.size;
      if (size > 10 * 1024 * 1024) { cancel(); callbacks.onError('음성은 10 MiB 이하이어야 합니다. 다시 녹음해 주세요.'); }
    };
    recording.onerror = () => { if (!cancelled) { cancel(); callbacks.onError('녹음에 실패했습니다. 다시 시도해 주세요.'); } };
    recording.onstop = () => {
      if (cancelled) return;
      const result = new Blob(chunks, { type: recording.mimeType }); const elapsed = performance.now() - began;
      cancel();
      if (elapsed < 1000 || !result.size) callbacks.onError('1초 이상 답변해 주세요.'); else callbacks.onComplete(result);
    };
    recording.start(1000); callbacks.onStarted();
    tick = setInterval(() => callbacks.onSeconds(Math.floor((performance.now() - began) / 1000)), 250);
    // Leave space for encoder frame padding so the decoded recording stays within 120 seconds.
    limit = setTimeout(() => { if (recording.state === 'recording') recording.stop(); }, 119500);
  }
  function stop() { if (recorder?.state === 'recording') recorder.stop(); }
  return { start, stop, cancel };
}
