import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const workspaceDir = '/Users/parkjunseong/Documents/avatye/WEEK1';
const buildDir = path.join(workspaceDir, 'tmp/presentation-build-20261013');
const sourcePath = path.join(workspaceDir, 'output/presentations/root-english-conversation-7slides.pptx');
const candidatePath = path.join(buildDir, 'compatibility/checked-candidate.pptx');
const finalPath = path.join(workspaceDir, 'output/presentations/root-english-conversation-7slides-checked.pptx');
const skillDir = '/Users/parkjunseong/.codex/plugins/cache/openai-primary-runtime/presentations/26.1011.11113/skills/presentations';
const runtimeDir = '/Users/parkjunseong/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const original = await fs.readFile(sourcePath);
const zip = await JSZip.loadAsync(original, { checkCRC32: true });

const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
const notes = Object.keys(zip.files).filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
let properties = await zip.file('docProps/app.xml').async('string');
properties = properties.replace(/<ap:Slides>\d+<\/ap:Slides>/, `<ap:Slides>${slides.length}</ap:Slides>`)
  .replace(/<ap:Notes>\d+<\/ap:Notes>/, `<ap:Notes>${notes.length}</ap:Notes>`);
zip.file('docProps/app.xml', properties);
zip.file('docProps/thumbnail.png', await fs.readFile(path.join(buildDir, 'final-renders/slide-1.png')));

let relationships = await zip.file('_rels/.rels').async('string');
relationships = relationships.replace('</Relationships>', '<Relationship Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="/docProps/thumbnail.png" Id="RThumbnailPreview" /></Relationships>');
zip.file('_rels/.rels', relationships);
let contentTypes = await zip.file('[Content_Types].xml').async('string');
if (!/Extension="png"/.test(contentTypes)) {
  contentTypes = contentTypes.replace('</Types>', '<Default Extension="png" ContentType="image/png" /></Types>');
  zip.file('[Content_Types].xml', contentTypes);
}
await fs.writeFile(candidatePath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

const checked = await JSZip.loadAsync(await fs.readFile(candidatePath));
for (const name of Object.keys(zip.files).filter((name) => name.startsWith('ppt/') && !zip.files[name].dir)) {
  const oldZip = await JSZip.loadAsync(original);
  const before = await oldZip.file(name).async('nodebuffer');
  const after = await checked.file(name).async('nodebuffer');
  if (!before.equals(after)) throw new Error(`Unexpected slide-content change: ${name}`);
}
process.env.RUNTIME_NODE_MODULES = path.join(runtimeDir, 'node/node_modules');
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href);
await finalizePresentation({
  workspaceDir, candidatePath, finalPath, explicitTotalSlideCount: 7,
  pythonExecutable: path.join(runtimeDir, 'python/bin/python3'),
  integrityValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit'],
  requiredNativeTableOwnerSlides: [], requiredNativeChartOwnerSlides: [],
  fontPolicy: { basis: 'reference', families: ['Apple SD Gothic Neo'], referencePath: sourcePath,
    referenceSha256: createHash('sha256').update(original).digest('hex'), scriptFonts: { ea: 'Apple SD Gothic Neo' } },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, 'compatibility/checked.validation.json'),
});
console.log(JSON.stringify({ finalPath, slides: slides.length, notes: notes.length, allSlidePartsPreserved: true }));
