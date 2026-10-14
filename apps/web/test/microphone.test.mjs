import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { checkMicrophone, microphoneErrorMessage } = require(join(process.env.AUDIO_UNIT_OUTPUT, 'microphone.js'));

test('microphone preflight closes every track without recording and supports the MP4 fallback', async () => {
  let stopped = 0;
  let requested = 0;
  let recorders = 0;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder');
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { async getUserMedia(input) { assert.deepEqual(input, { audio: true }); requested++; return { getTracks: () => [{ stop() { stopped++; } }, { stop() { stopped++; } }] }; } } } });
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: class {
      constructor() { recorders++; }
      static isTypeSupported(format) { return format === 'audio/mp4'; }
    } });
    await checkMicrophone();
    assert.equal(requested, 1);
    assert.equal(stopped, 2);
    assert.equal(recorders, 0);
    globalThis.MediaRecorder.isTypeSupported = () => false;
    await assert.rejects(checkMicrophone, /녹음 형식/);
    assert.equal(requested, 1);
    globalThis.MediaRecorder.isTypeSupported = () => true;
    globalThis.navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };
    await assert.rejects(checkMicrophone, { name: 'NotAllowedError' });
    assert.match(microphoneErrorMessage(new DOMException('denied', 'NotAllowedError')), /권한/);
    assert.match(microphoneErrorMessage(new DOMException('absent', 'NotFoundError')), /연결/);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator;
    if (originalRecorder) Object.defineProperty(globalThis, 'MediaRecorder', originalRecorder); else delete globalThis.MediaRecorder;
  }
});
