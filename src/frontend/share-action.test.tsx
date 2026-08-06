import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareAction } from './share-action';

afterEach(() => vi.unstubAllGlobals());

describe('ShareAction', () => {
  it('uses native sharing and announces success when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });

    render(<ShareAction url="https://tokenbench.monomind.one/compare/a-vs-b" title="A vs B" text="Compare A and B" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share result' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Link shared.');
    expect(share).toHaveBeenCalledWith({
      url: 'https://tokenbench.monomind.one/compare/a-vs-b',
      title: 'A vs B',
      text: 'Compare A and B',
    });
  });

  it('falls back to clipboard and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<ShareAction url="https://tokenbench.monomind.one/compare/a-vs-b" title="A vs B" text="Compare A and B" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share result' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Link copied to clipboard.');
    expect(writeText).toHaveBeenCalledWith('https://tokenbench.monomind.one/compare/a-vs-b');
  });

  it('announces an accessible failure when neither sharing path is available', async () => {
    vi.stubGlobal('navigator', {});

    render(<ShareAction url="https://tokenbench.monomind.one/compare/a-vs-b" title="A vs B" text="Compare A and B" label="Share comparison" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share comparison' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to share this link. Please copy the URL from your browser.');
  });
});
