import { cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prototypeDirectory = join(projectRoot, 'prototypes', 'ui-revamp-3');

interface PreviewPageBundle {
  readonly route: readonly string[];
  readonly document: string;
  readonly scripts: readonly string[];
  readonly includeData?: boolean;
}

const previewPageBundles: readonly PreviewPageBundle[] = [
  { route: ['models'], document: 'index.html', scripts: [], includeData: true },
  { route: ['compare'], document: 'compare.html', scripts: [], includeData: true },
  { route: ['model-profile'], document: 'model-profile.html', scripts: [], includeData: true },
  { route: ['model-lifecycle'], document: 'model-lifecycle.html', scripts: [], includeData: true },
  { route: ['make-it-yours'], document: 'make-it-yours.html', scripts: ['make-it-yours.js'], includeData: true },
  { route: ['articles'], document: 'articles.html', scripts: ['articles.js'], includeData: true },
  { route: ['articles', 'hybrid-router'], document: 'article-hybrid-router.html', scripts: ['article-detail.js'] },
];

async function copyPreviewPage(outputDirectory: string, page: PreviewPageBundle): Promise<void> {
  const destination = join(outputDirectory, ...page.route);
  await mkdir(destination, { recursive: true });
  const files = [
    cp(join(prototypeDirectory, page.document), join(destination, 'index.html')),
    cp(join(prototypeDirectory, 'common.js'), join(destination, 'common.js')),
    cp(join(prototypeDirectory, 'styles.css'), join(destination, 'styles.css')),
    cp(join(prototypeDirectory, 'assets'), join(destination, 'assets'), { recursive: true }),
    ...page.scripts.map((script) => cp(join(prototypeDirectory, script), join(destination, script))),
  ];
  if (page.includeData) files.push(cp(join(prototypeDirectory, 'data.js'), join(destination, 'data.js')));
  await Promise.all(files);
}

/** Copies the approved rebuilt surfaces into their Pages canonical routes. */
export async function copyMakeItYoursPreview(outputDirectory: string): Promise<void> {
  await Promise.all(previewPageBundles.map((page) => copyPreviewPage(outputDirectory, page)));
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
