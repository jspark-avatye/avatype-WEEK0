import { useCallback, useEffect, useRef, useState } from 'react';
import { microphoneErrorMessage } from './microphone';
import { createRecording } from './recorder';
export type RecordingState = 'IDLE' | 'REQUESTING' | 'RECORDING' | 'RECORDED';
export function useAudioRecorder(enabled: boolean) {
  const [state, setState] = useState<RecordingState>('IDLE'); const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState(''); const [seconds, setSeconds] = useState(0);
  const handle = useRef<ReturnType<typeof createRecording> | null>(null);
  const teardown = useCallback(() => { handle.current?.cancel(); handle.current = null; }, []);
  const cancel = useCallback(() => { teardown(); setBlob(null); setState('IDLE'); setSeconds(0); }, [teardown]);
  useEffect(() => { if (!enabled) cancel(); return teardown; }, [enabled, cancel, teardown]);
  const start = useCallback(async () => {
    if (!enabled || handle.current) return;
    cancel(); setError(''); setState('REQUESTING');
    const recording = createRecording({
      onStarted: () => setState('RECORDING'), onSeconds: setSeconds,
      onComplete: (result) => { handle.current = null; setBlob(result); setState('RECORDED'); },
      onError: (message) => { handle.current = null; setState('IDLE'); setError(message); },
    });
    handle.current = recording;
    try { await recording.start(); }
    catch (error) {
      if (handle.current !== recording) return;
      teardown(); setState('IDLE'); setError(error instanceof DOMException ? microphoneErrorMessage(error) : error instanceof Error ? error.message : '마이크를 사용할 수 없습니다.');
    }
  }, [enabled, cancel, teardown]);
  const stop = useCallback(() => handle.current?.stop(), []);
  return { state, blob, error, seconds, start, stop, cancel };
}
