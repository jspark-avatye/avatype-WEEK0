import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const web = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = mkdtempSync(join(tmpdir(), 'root-audio-test-'));
try {
  const compiler = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--strict', '--target', 'ES2022', '--module', 'commonjs', '--skipLibCheck', '--outDir', output, join(web, 'src/shared/lib/audio/microphone.ts'), join(web, 'src/shared/lib/audio/recorder.ts')], { stdio: 'inherit' });
  if (compiler.status !== 0) process.exitCode = compiler.status ?? 1;
  else {
    const tests = spawnSync(process.execPath, ['--test', join(web, 'test/microphone.test.mjs'), join(web, 'test/recorder.test.mjs')], { stdio: 'inherit', env: { ...process.env, AUDIO_UNIT_OUTPUT: output } });
    process.exitCode = tests.status ?? 1;
    if (tests.status === 0) {
      const refresh = spawnSync(process.execPath, ['--test', join(web, 'test/multipart-refresh.test.mjs')], { stdio: 'inherit' });
      process.exitCode = refresh.status ?? 1;
    }
  }
} finally { rmSync(output, { recursive: true, force: true }); }
