import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prototypeDirectory = join(projectRoot, 'prototypes', 'ui-revamp-3');
const sharedAssetPath = '/ui-revamp-3-assets';
const sharedAssetDirectoryName = sharedAssetPath.slice(1);

interface PreviewPageBundle {
  readonly output: readonly string[];
  readonly document: string;
}

const previewPageBundles: readonly PreviewPageBundle[] = [
  { output: ['models.html'], document: 'index.html' },
  { output: ['compare.html'], document: 'compare.html' },
  { output: ['model-profile', 'index.html'], document: 'model-profile.html' },
  { output: ['model-lifecycle', 'index.html'], document: 'model-lifecycle.html' },
  { output: ['make-it-yours', 'index.html'], document: 'make-it-yours.html' },
  { output: ['articles.html'], document: 'articles.html' },
  { output: ['articles', 'hybrid-router.html'], document: 'article-hybrid-router.html' },
];

const sharedScripts = ['common.js', 'data.js', 'make-it-yours.js', 'articles.js', 'article-detail.js'] as const;

function withSharedAssetPaths(document: string): string {
  return document
    .replace(/(src|href)="(styles\.css|data\.js|common\.js|make-it-yours\.js|articles\.js|article-detail\.js)([^"]*)"/gu, (_match, attribute, file, suffix) => `${attribute}="${sharedAssetPath}/${file}${suffix}"`)
    .replaceAll('src="assets/', `src="${sharedAssetPath}/assets/`)
    .replaceAll('href="assets/', `href="${sharedAssetPath}/assets/`);
}

async function copyPreviewPage(outputDirectory: string, page: PreviewPageBundle): Promise<void> {
  const destination = join(outputDirectory, ...page.output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, withSharedAssetPaths(await readFile(join(prototypeDirectory, page.document), 'utf8')));
}

async function copySharedAssets(outputDirectory: string): Promise<void> {
  const destination = join(outputDirectory, sharedAssetDirectoryName);
  await mkdir(destination, { recursive: true });
  await Promise.all([
    cp(join(prototypeDirectory, 'styles.css'), join(destination, 'styles.css')),
    cp(join(prototypeDirectory, 'assets'), join(destination, 'assets'), { recursive: true }),
    ...sharedScripts.map((script) => cp(join(prototypeDirectory, script), join(destination, script))),
  ]);
}

/** Copies the approved rebuilt surfaces into their Pages canonical routes. */
export async function copyMakeItYoursPreview(outputDirectory: string): Promise<void> {
  await Promise.all(['models', 'compare', 'articles'].map((directory) => rm(join(outputDirectory, directory), { recursive: true, force: true })));
  await Promise.all([
    copySharedAssets(outputDirectory),
    ...previewPageBundles.map((page) => copyPreviewPage(outputDirectory, page)),
  ]);
}

/** Emits the preview only for production builds, after Vite clears the output directory. */
export function makeItYoursPreviewPlugin(): Plugin {
  let outputDirectory = '';

  return {
    name: 'copy-approved-preview-pages',
    apply: 'build',
    configResolved(config) {
      outputDirectory = config.build.outDir;
    },
    async closeBundle() {
      await copyMakeItYoursPreview(outputDirectory);
    },
  };
}
