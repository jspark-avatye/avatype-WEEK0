import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const api = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = mkdtempSync(join(tmpdir(), 'root-evaluation-test-'));
try {
  const compiler = require.resolve('typescript/bin/tsc');
  const compiled = spawnSync(process.execPath, [compiler,
    '--strict', '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck',
    '--rootDir', join(api, 'src'), '--outDir', output,
    join(api, 'src/module/evaluation/application/evaluation.service.ts'),
    join(api, 'src/module/evaluation/application/conversation.service.ts'),
    join(api, 'src/module/evaluation/domain/ai-failure.ts'),
    join(api, 'src/trpc/multipart-request.ts'),
  ], { stdio: 'inherit' });
  if (compiled.status !== 0) process.exitCode = compiled.status ?? 1;
  else {
    const tests = spawnSync(process.execPath, ['--test', join(api, 'test/first-question.test.mjs')], {
      stdio: 'inherit', env: { ...process.env, EVALUATION_UNIT_OUTPUT: join(output, 'module/evaluation') },
    });
    process.exitCode = tests.status ?? 1;
    if (tests.status === 0) {
      const transport = spawnSync(process.execPath, ['--test', join(api, 'test/rpc-transport.test.mjs'), join(api, 'test/rpc-node-transport.test.mjs')], {
        stdio: 'inherit', env: { ...process.env, TRPC_UNIT_OUTPUT: join(output, 'trpc') },
      });
      process.exitCode = transport.status ?? 1;
    }
  }
} finally { rmSync(output, { recursive: true, force: true }); }
