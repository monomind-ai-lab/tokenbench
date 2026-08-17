import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PreviewStaticEntry } from '../src/preview/route-manifest';
import { copyMakeItYoursPreview } from './make-it-yours-preview';

const outputRoots: string[] = [];

afterEach(async () => {
  await Promise.all(outputRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('preview route delivery', () => {
  it('preserves a React document when a prototype entry targets the same output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-preview-delivery-'));
    outputRoots.push(root);
    const destination = join(root, 'models', 'index.html');
    await mkdir(join(root, 'models'), { recursive: true });
    await writeFile(destination, 'react document');

    const prototypeEntry: PreviewStaticEntry = {
      routeId: 'models',
      delivery: 'prototype',
      source: 'prototype-bundle',
      outputPathname: '/models/',
      output: ['models', 'index.html'],
      document: 'index.html',
      clearOutputDirectory: true,
      match: { routeId: 'models', pathname: '/models/', search: new URLSearchParams(), hash: '', params: {} },
    };
    const reactEntry: PreviewStaticEntry = { ...prototypeEntry, delivery: 'react' };

    await copyMakeItYoursPreview(root, [prototypeEntry, reactEntry]);

    await expect(readFile(destination, 'utf8')).resolves.toBe('react document');
  });

  it('preserves a nested React document when prototype cleanup clears its parent route directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-nested-react-delivery-'));
    outputRoots.push(root);
    const nestedReactDocument = join(root, 'models', 'release-notes', 'index.html');
    await mkdir(join(root, 'models', 'release-notes'), { recursive: true });
    await writeFile(nestedReactDocument, 'nested react document');

    const prototypeParent: PreviewStaticEntry = {
      routeId: 'models',
      delivery: 'prototype',
      source: 'prototype-bundle',
      outputPathname: '/models/',
      output: ['models', 'index.html'],
      document: 'index.html',
      clearOutputDirectory: true,
      match: { routeId: 'models', pathname: '/models/', search: new URLSearchParams(), hash: '', params: {} },
    };
    const nestedReactRoute: PreviewStaticEntry = {
      routeId: 'model-profile',
      delivery: 'react',
      source: 'prototype-bundle',
      outputPathname: '/models/release-notes/',
      output: ['models', 'release-notes', 'index.html'],
      document: 'index.html',
      clearOutputDirectory: false,
      match: { routeId: 'model-profile', pathname: '/models/release-notes/', search: new URLSearchParams(), hash: '', params: {} },
    };

    await copyMakeItYoursPreview(root, [prototypeParent, nestedReactRoute]);

    await expect(readFile(nestedReactDocument, 'utf8')).resolves.toBe('nested react document');
  });

  it('does not copy shared prototype assets when every route is React-delivered', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-react-delivery-assets-'));
    outputRoots.push(root);
    const reactEntry: PreviewStaticEntry = {
      routeId: 'models',
      delivery: 'react',
      source: 'prototype-bundle',
      outputPathname: '/models/',
      output: ['models', 'index.html'],
      document: 'index.html',
      clearOutputDirectory: true,
      match: { routeId: 'models', pathname: '/models/', search: new URLSearchParams(), hash: '', params: {} },
    };

    await copyMakeItYoursPreview(root, [reactEntry]);

    await expect(access(join(root, 'ui-revamp-3-assets'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
