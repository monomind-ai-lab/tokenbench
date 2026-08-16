import { cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prototypeDirectory = join(projectRoot, 'prototypes', 'ui-revamp-3');

/** Copies the self-contained vanilla prototype into the Pages canonical route. */
export async function copyMakeItYoursPreview(outputDirectory: string): Promise<void> {
  const destination = join(outputDirectory, 'make-it-yours');
  await mkdir(destination, { recursive: true });

  await Promise.all([
    cp(join(prototypeDirectory, 'make-it-yours.html'), join(destination, 'index.html')),
    cp(join(prototypeDirectory, 'make-it-yours.js'), join(destination, 'make-it-yours.js')),
    cp(join(prototypeDirectory, 'common.js'), join(destination, 'common.js')),
    cp(join(prototypeDirectory, 'data.js'), join(destination, 'data.js')),
    cp(join(prototypeDirectory, 'styles.css'), join(destination, 'styles.css')),
    cp(join(prototypeDirectory, 'assets'), join(destination, 'assets'), { recursive: true }),
  ]);
}

/** Emits the preview only for production builds, after Vite clears the output directory. */
export function makeItYoursPreviewPlugin(): Plugin {
  let outputDirectory = '';

  return {
    name: 'copy-make-it-yours-preview',
    apply: 'build',
    configResolved(config) {
      outputDirectory = config.build.outDir;
    },
    async closeBundle() {
      await copyMakeItYoursPreview(outputDirectory);
    },
  };
}
