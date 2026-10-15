import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceDir = fileURLToPath(new URL('../../', import.meta.url));
const buildDir = path.join(workspaceDir, 'tmp/presentation-build-20261013');
const skillDir = '/Users/parkjunseong/.codex/plugins/cache/openai-primary-runtime/presentations/26.1011.11113/skills/presentations';
const runtimeDir = '/Users/parkjunseong/.cache/codex-runtimes/codex-primary-runtime/dependencies';
process.env.RUNTIME_NODE_MODULES = path.join(runtimeDir, 'node/node_modules');
process.env.RUNTIME_BIN_DIR = path.join(runtimeDir, 'bin/override');
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href);

const finalPath = path.join(workspaceDir, 'output/presentations/root-english-conversation-7slides.pptx');
const result = await finalizePresentation({
  explicitTotalSlideCount: 7,
  workspaceDir,
  candidatePath: path.join(buildDir, 'candidate.pptx'),
  finalPath,
  pythonExecutable: path.join(runtimeDir, 'python/bin/python3'),
  integrityValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit'],
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  fontPolicy: { basis: 'design', families: ['Apple SD Gothic Neo'], scriptFonts: { ea: 'Apple SD Gothic Neo' } },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, 'final.validation.json'),
});
console.log(JSON.stringify({ finalPath, result }));
