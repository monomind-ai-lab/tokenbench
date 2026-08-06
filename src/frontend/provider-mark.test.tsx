import { execFile as execFileCallback } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelMark, ProviderMark } from './provider-mark';

const execFile = promisify(execFileCallback);

afterEach(() => vi.unstubAllEnvs());

describe('ProviderMark', () => {
  it('uses the public Brandfetch icon variant with reserved dimensions and lazy loading', () => {
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', 'public-client');

    render(<ProviderMark providerId="openai" providerName="OpenAI" size={24} theme="dark" />);

    const image = screen.getByRole('img', { name: 'OpenAI' });
    expect(image).toHaveAttribute('width', '24');
    expect(image).toHaveAttribute('height', '24');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('src', expect.stringContaining('cdn.brandfetch.io/openai.com'));
    expect(image).toHaveAttribute('src', expect.stringContaining('/theme/dark/icon'));
  });

  it('replaces a failed Brandfetch image with a labelled lettermark', () => {
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', 'public-client');

    render(<ProviderMark providerId="anthropic" providerName="Anthropic" size={24} theme="dark" />);
    fireEvent.error(screen.getByRole('img', { name: 'Anthropic' }));

    expect(screen.getByRole('img', { name: 'Anthropic' })).toHaveTextContent('A');
    expect(screen.getByText('A')).toHaveAttribute('aria-label', 'Anthropic');
  });

  it('preserves decorative semantics for a fallback mark', () => {
    render(<ProviderMark providerId="unknown-lab" providerName="Unknown lab" decorative />);

    expect(screen.getByText('U')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByLabelText('Unknown lab')).not.toBeInTheDocument();
  });

  it('renders an SSR-safe fallback even when Brandfetch is configured', () => {
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', 'public-client');

    const markup = renderToStaticMarkup(<ProviderMark providerId="openai" providerName="OpenAI" />);

    expect(markup).toContain('provider-mark-fallback');
    expect(markup).not.toContain('cdn.brandfetch.io');
  });

  it('falls back without throwing during raw TSX SSR when Vite env injection is unavailable', async () => {
    const projectRoot = process.cwd();
    const providerMarkModule = pathToFileURL(resolve(projectRoot, 'src/frontend/provider-mark.tsx')).href;
    const program = [
      'const React = await import("react");',
      'const { renderToStaticMarkup } = await import("react-dom/server");',
      `const { ProviderMark } = await import(${JSON.stringify(providerMarkModule)});`,
      'process.stdout.write(renderToStaticMarkup(React.createElement(ProviderMark, { providerId: "openai", providerName: "OpenAI" })));',
    ].join('\n');

    const { stdout, stderr } = await execFile(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', program], {
      cwd: projectRoot,
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('provider-mark-fallback');
    expect(stdout).toContain('aria-label="OpenAI"');
  });

  it('hydrates a raw SSR fallback without mismatch before upgrading to a configured Brandfetch image', async () => {
    const projectRoot = process.cwd();
    const providerMarkModule = pathToFileURL(resolve(projectRoot, 'src/frontend/provider-mark.tsx')).href;
    const program = [
      'const React = await import("react");',
      'const { renderToStaticMarkup } = await import("react-dom/server");',
      `const { ProviderMark } = await import(${JSON.stringify(providerMarkModule)});`,
      'process.stdout.write(renderToStaticMarkup(React.createElement(ProviderMark, { providerId: "openai", providerName: "OpenAI", size: 24 })));',
    ].join('\n');
    const { stdout } = await execFile(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', program], { cwd: projectRoot });
    const container = document.createElement('div');
    container.innerHTML = stdout;
    document.body.append(container);
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', 'public-client');
    const recoverableErrors: unknown[] = [];
    const root = hydrateRoot(container, <ProviderMark providerId="openai" providerName="OpenAI" size={24} />, {
      onRecoverableError: (error) => recoverableErrors.push(error),
    });

    try {
      expect(container.querySelector('.provider-mark-fallback')).toBeInTheDocument();
      await act(async () => {});

      expect(recoverableErrors).toEqual([]);
      expect(within(container).getByRole('img', { name: 'OpenAI' })).toHaveAttribute('src', expect.stringContaining('cdn.brandfetch.io/openai.com'));
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('retries Brandfetch when a failed mark receives a new source', () => {
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', 'public-client');
    const { rerender } = render(<ProviderMark providerId="anthropic" providerName="Anthropic" size={20} theme="dark" />);

    fireEvent.error(screen.getByRole('img', { name: 'Anthropic' }));
    rerender(<ProviderMark providerId="anthropic" providerName="Anthropic" size={32} theme="light" />);

    expect(screen.getByRole('img', { name: 'Anthropic' })).toHaveAttribute('src', expect.stringContaining('/w/32/h/32/theme/light/icon'));

    fireEvent.error(screen.getByRole('img', { name: 'Anthropic' }));
    rerender(<ProviderMark providerId="openai" providerName="OpenAI" size={32} theme="light" />);

    expect(screen.getByRole('img', { name: 'OpenAI' })).toHaveAttribute('src', expect.stringContaining('cdn.brandfetch.io/openai.com'));
  });
});

describe('ModelMark', () => {
  it('reserves dimensions and never guesses an unreviewed model brand', () => {
    render(<ModelMark modelId="unknown/model" providerId="unknown-lab" providerName="Unknown lab" size={32} />);

    expect(document.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Unknown lab')).toHaveStyle({ width: '32px', height: '32px' });
  });

  it('inherits a verified provider mark for an unreviewed model', () => {
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', 'public-client');

    render(<ModelMark modelId="unknown/model" providerId="openai" providerName="OpenAI" />);

    expect(screen.getByRole('img', { name: 'OpenAI' })).toHaveAttribute('src', expect.stringContaining('openai.com'));
  });
});
