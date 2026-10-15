export async function checkMicrophone(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('이 브라우저에서는 음성 녹음을 지원하지 않습니다. 최신 Chrome 또는 Safari에서 접속해 주세요.');
  }
  if (!['audio/webm;codecs=opus', 'audio/mp4'].some((format) => MediaRecorder.isTypeSupported(format))) {
    throw new Error('지원되는 녹음 형식이 없습니다. 최신 Chrome 또는 Safari에서 접속해 주세요.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

export function microphoneErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return '브라우저에서 마이크 권한을 허용한 뒤 다시 확인해 주세요.';
    if (error.name === 'NotFoundError') return '사용할 수 있는 마이크가 없습니다. 마이크를 연결해 주세요.';
    return '마이크를 사용할 수 없습니다. 다른 앱의 마이크 사용 여부를 확인한 뒤 다시 시도해 주세요.';
  }
  return error instanceof Error ? error.message : '마이크를 확인하지 못했습니다.';
}
