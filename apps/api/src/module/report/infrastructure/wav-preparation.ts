import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import type { ReportAudioPreparation } from '../application/report.ports';
import { ProcessingError } from '../../../shared/processing-error';
import { ReportConfig } from './report-config';
const run = promisify(execFile);
@Injectable()
export class WavPreparation implements ReportAudioPreparation {
  constructor(private readonly config: ReportConfig) {}
  async wav(bytes: Uint8Array): Promise<Uint8Array> {
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new ProcessingError('AI_INVALID_AUDIO', false);
    const directory = await mkdtemp(join(tmpdir(), 'root-report-audio-'));
    try {
      const source = join(directory, 'input'); const output = join(directory, 'prepared.wav');
      await writeFile(source, bytes);
      await run(this.config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', source, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', output], { timeout: 15000, maxBuffer: 65536 });
      const wav = await readFile(output);
      if (wav.length < 44 || wav.length > 4 * 1024 * 1024 + 65536 || wav.subarray(0, 4).toString() !== 'RIFF' || wav.subarray(8, 12).toString() !== 'WAVE') throw new ProcessingError('AI_INVALID_AUDIO', false);
      return wav;
    } catch (error) {
      if (error instanceof ProcessingError) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') throw new ProcessingError('AUDIO_CONFIGURATION', true);
      throw new ProcessingError('AI_INVALID_AUDIO', false);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}
