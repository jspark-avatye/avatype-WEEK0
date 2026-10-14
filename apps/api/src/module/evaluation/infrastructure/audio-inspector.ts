import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { AudioInspector } from '../application/evaluation.ports';
import { EvaluationError, ProcessingError } from '../domain/evaluation-error';
import { EvaluationConfig } from './evaluation-config';
const run = promisify(execFile);
function object(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}; }
@Injectable()
export class FfprobeAudioInspector implements AudioInspector {
  constructor(private readonly config: EvaluationConfig) {}
  private async inspect(bytes: Uint8Array, answer: boolean, claimedMime = '') {
    const invalid = () => answer ? new EvaluationError('BAD_REQUEST', 'WebM(Opus) 또는 MP4(AAC) 형식의 1~120초 음성을 보내 주세요.') : new ProcessingError('AI_INVALID_AUDIO', true);
    if (!bytes.byteLength || bytes.byteLength > (answer ? this.config.maximumAnswerBytes : this.config.maximumAudioBytes)) throw invalid();
    const directory = await mkdtemp(join(tmpdir(), 'root-audio-'));
    try {
      const path = join(directory, 'input'); await writeFile(path, bytes);
      const { stdout } = await run(this.config.ffprobePath, ['-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_name,codec_type', '-of', 'json', path], { timeout: 10000, maxBuffer: 65536, encoding: 'utf8' });
      const probe = object(JSON.parse(stdout)); const format = object(probe.format);
      const streams: unknown[] = Array.isArray(probe.streams) ? probe.streams : [];
      const stream = object(streams[0]);
      if (streams.length !== 1 || stream.codec_type !== 'audio') throw invalid();
      const webm = typeof format.format_name === 'string' && format.format_name.includes('webm') && stream.codec_name === 'opus';
      const mp4 = typeof format.format_name === 'string' && format.format_name.includes('mp4') && stream.codec_name === 'aac';
      let durationMs = Math.ceil(Number(format.duration) * 1000);
      if (answer) {
        const mime = claimedMime.split(';')[0]?.trim().toLowerCase();
        if ((!webm && !mp4) || (webm && mime !== 'audio/webm') || (mp4 && mime !== 'audio/mp4')) throw invalid();
        // Decode to validate the entire recording and recover MediaRecorder WebM's missing duration.
        const decoded = await run(this.config.ffmpegPath, ['-nostdin', '-hide_banner', '-i', path, '-map', '0:a:0', '-af', 'volumedetect', '-progress', 'pipe:1', '-f', 'null', '-'], { timeout: 15000, maxBuffer: 65536, encoding: 'utf8' });
        const elapsed = [...decoded.stdout.matchAll(/out_time_us=(\d+)/g)].at(-1)?.[1];
        if (elapsed) durationMs = Math.ceil(Number(elapsed) / 1000);
        const peak = decoded.stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?|-inf) dB/)?.[1];
        if (peak && (peak === '-inf' || Number(peak) <= -60)) throw new EvaluationError('BAD_REQUEST', '음성에서 발화를 찾을 수 없습니다. 다시 녹음해 주세요.');
        if (!Number.isSafeInteger(durationMs) || durationMs < 1000 || durationMs > 120000) throw invalid();
      } else if (stream.codec_name !== 'mp3' || !Number.isSafeInteger(durationMs) || durationMs <= 0) throw invalid();
      return { byteSize: bytes.byteLength, durationMs, mimeType: answer ? webm ? 'audio/webm' : 'audio/mp4' : 'audio/mpeg', extension: answer ? webm ? 'webm' : 'mp4' : 'mp3' };
    } catch (error) {
      if (error instanceof ProcessingError || error instanceof EvaluationError) throw error;
      if (object(error).code === 'ENOENT') throw new ProcessingError('AUDIO_CONFIGURATION', false);
      throw invalid();
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  async inspectMp3(bytes: Uint8Array) { const { byteSize, durationMs } = await this.inspect(bytes, false); return { byteSize, durationMs }; }
  async inspectAnswer(bytes: Uint8Array, mimeType: string) { return this.inspect(bytes, true, mimeType); }
}
