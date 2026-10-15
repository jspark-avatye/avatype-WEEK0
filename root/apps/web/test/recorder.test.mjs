import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { createRecording } = require(join(process.env.AUDIO_UNIT_OUTPUT, 'recorder.js'));
function fixture() {
  const old = { navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), MediaRecorder: globalThis.MediaRecorder, performance: globalThis.performance };
  let clock = 0; let stops = 0; const records = []; const events = [];
  const media = { getTracks: () => [{ stop() { stops++; } }] };
  let acquire = async () => media;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => acquire() } } });
  globalThis.performance = { now: () => clock };
  globalThis.MediaRecorder = class {
    static isTypeSupported(mime) { return mime === 'audio/mp4'; }
    constructor(stream, { mimeType }) { this.mimeType = mimeType; this.state = 'inactive'; records.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
    chunk(text) { this.ondataavailable?.({ data: new Blob([text]) }); }
  };
  const handle = createRecording({ onStarted: () => events.push('start'), onComplete: (blob) => events.push(blob), onError: (message) => events.push(message), onSeconds() {} });
  return { handle, events, records, media, get stops() { return stops; }, set clock(v) { clock = v; }, set acquire(v) { acquire = v; }, cleanup() { handle.cancel(); if (old.navigator) Object.defineProperty(globalThis, 'navigator', old.navigator); else delete globalThis.navigator; globalThis.MediaRecorder = old.MediaRecorder; globalThis.performance = old.performance; } };
}
test('recorder joins local chunks into one original MP4 file and closes microphone', async () => { const f = fixture(); try { await f.handle.start(); f.records[0].chunk('first'); f.records[0].chunk('second'); f.clock = 2000; f.handle.stop(); assert.equal(f.events[1].type, 'audio/mp4'); assert.equal(await f.events[1].text(), 'firstsecond'); assert.equal(f.stops, 1); } finally { f.cleanup(); } });
test('cancel after permission request prevents recording and closes returned tracks', async () => { const f = fixture(); try { let release; f.acquire = () => new Promise((r) => { release = r; }); const pending = f.handle.start(); f.handle.cancel(); release(f.media); await pending; assert.equal(f.records.length, 0); assert.equal(f.stops, 1); assert.equal(f.events.length, 0); } finally { f.cleanup(); } });
test('cancel discards captured chunks without completion; short answer is rejected', async () => { const f = fixture(); try { await f.handle.start(); f.records[0].chunk('voice'); f.handle.cancel(); assert.equal(f.events.length, 1); assert.equal(f.stops, 1); } finally { f.cleanup(); } const short = fixture(); try { await short.handle.start(); short.records[0].chunk('voice'); short.clock = 100; short.handle.stop(); assert.equal(typeof short.events[1], 'string'); assert.equal(short.stops, 1); } finally { short.cleanup(); } });
