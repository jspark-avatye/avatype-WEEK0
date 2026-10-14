import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.corepack-cache');
const binaries = join(cache, 'bin');
const [command, ...extra] = process.argv.slice(2);
const commands = {
  build: [['exec', 'turbo', 'build']],
  dev: [['--filter', '@root/trpc-contract', 'build'], ['--filter', '@root/database', 'build'], ['exec', 'turbo', 'dev']],
  typecheck: [['--filter', '@root/trpc-contract', 'build'], ['--filter', '@root/database', 'build'], ['exec', 'turbo', 'typecheck']],
  'ai:check': [['--filter', '@root/trpc-contract', 'build'], ['--filter', '@root/database', 'build'], ['--filter', '@root/api', 'ai:check']],
  'test:auth': [['--filter', '@root/web', 'test:auth']],
  'test:evaluation': [['--filter', '@root/trpc-contract', 'build'], ['--filter', '@root/api', 'test:evaluation'], ['--filter', '@root/web', 'test:audio'], ['--filter', '@root/web', 'test:render']],
  'test:report': [['--filter', '@root/trpc-contract', 'build'], ['--filter', '@root/database', 'build'], ['--filter', '@root/api', 'build'], ['--filter', '@root/api', 'test:report'], ['--filter', '@root/web', 'test:render']],
  'test:report:db': [['--filter', '@root/trpc-contract', 'build'], ['--filter', '@root/database', 'build'], ['--filter', '@root/api', 'build'], ['--filter', '@root/api', 'test:report:db']],
  'report:check': [['--filter', '@root/trpc-contract', 'build'], ['--filter', '@root/database', 'build'], ['--filter', '@root/api', 'report:check']],
  'test:report:integration': [['--filter', '@root/web', 'test:report:integration']],
  'test:render': [['--filter', '@root/web', 'test:render']],
  'test:evaluation:integration': [['--filter', '@root/web', 'test:evaluation']],
  'db:generate': [['--filter', '@root/database', 'db:generate']],
  'db:validate': [['--filter', '@root/database', 'db:validate']],
  'db:migrate:dev': [['--filter', '@root/database', 'db:migrate:dev']],
  'db:migrate:deploy': [['--filter', '@root/database', 'db:migrate:deploy']],
};

if (command !== 'install' && !Object.hasOwn(commands, command)) {
  console.error('Unknown workspace command.');
  process.exit(1);
}

mkdirSync(binaries, { recursive: true });
const environment = {
  ...process.env,
  COREPACK_HOME: process.env.COREPACK_HOME ?? cache,
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  PATH: `${binaries}${delimiter}${process.env.PATH ?? ''}`,
};

function corepack(args) {
  const result = spawnSync('corepack', args, { cwd: root, env: environment, stdio: 'inherit' });
  if (result.error) {
    console.error('Corepack 실행에 실패했습니다. Node.js 20.20 이상과 Corepack이 필요합니다.');
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Turbo launches `pnpm` itself. Keep its Corepack shim on PATH without modifying global Node binaries.
corepack(['enable', 'pnpm', '--install-directory', binaries]);
if (command === 'install' || !existsSync(join(root, 'pnpm-lock.yaml')) || !existsSync(join(root, 'node_modules', '.modules.yaml'))) {
  corepack(['pnpm', 'install', '--store-dir', join(root, '.pnpm-store'), ...(command === 'install' ? extra : [])]);
}
if (command !== 'install') {
  const steps = commands[command];
  steps.forEach((args, index) => corepack(['pnpm', ...args, ...(index === steps.length - 1 ? extra : [])]));
}
