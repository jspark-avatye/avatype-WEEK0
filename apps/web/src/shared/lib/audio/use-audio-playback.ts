import { useCallback, useEffect, useRef, useState } from 'react';

type Playback = 'LOADING' | 'PLAYING' | 'BLOCKED' | 'ERROR' | 'COMPLETED';

export function useAudioPlayback(mimeType: string, audioBase64: string) {
  const [state, setState] = useState<Playback>('LOADING');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.ended) return;
    void audio.play().then(() => {
      if (audioRef.current === audio) setState('PLAYING');
    }).catch((error: unknown) => {
      if (audioRef.current === audio) setState(error instanceof DOMException && error.name === 'NotAllowedError' ? 'BLOCKED' : 'ERROR');
    });
  }, []);

  useEffect(() => {
    let url: string | null = null;
    let audio: HTMLAudioElement | null = null;
    try {
      const bytes = Uint8Array.from(atob(audioBase64), (character) => character.charCodeAt(0));
      url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setState('COMPLETED');
      audio.onerror = () => setState('ERROR');
      play();
    } catch { setState('ERROR'); }
    return () => {
      if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); }
      audioRef.current = null;
      if (url) URL.revokeObjectURL(url);
    };
  }, [mimeType, audioBase64, play]);

  return { state, play };
}
