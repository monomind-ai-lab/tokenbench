import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelMark, ProviderMark } from './provider-mark';

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

  it('renders with an SSR-safe light theme default', () => {
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', 'public-client');

    const markup = renderToStaticMarkup(<ProviderMark providerId="openai" providerName="OpenAI" />);

    expect(markup).toContain('/theme/light/icon');
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
