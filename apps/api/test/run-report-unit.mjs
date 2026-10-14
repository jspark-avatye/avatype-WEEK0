import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const api = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = mkdtempSync(join(tmpdir(), 'root-report-test-'));
try {
  const compiler = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--strict', '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--rootDir', join(api, 'src'), '--outDir', output, join(api, 'src/module/report/application/report.service.ts')], { stdio: 'inherit' });
  if (compiler.status !== 0) process.exitCode = compiler.status ?? 1;
  else {
    const result = spawnSync(process.execPath, ['--test', join(api, 'test/report.test.mjs'), join(api, 'test/report-rpc.test.mjs'), join(api, 'test/report-gateway.test.mjs'), join(api, 'test/report-check.test.mjs'), join(api, 'test/module-wiring.test.mjs')], { stdio: 'inherit', env: { ...process.env, REPORT_UNIT_OUTPUT: output } });
    process.exitCode = result.status ?? 1;
  }
} finally { rmSync(output, { recursive: true, force: true }); }
