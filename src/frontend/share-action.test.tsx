import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('opens a canonical URL dialog without copying and restores trigger focus on Escape', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<ShareAction
      label="Share Leaderboard"
      canonicalUrl="https://tokenbench.monomind.one/leaderboards/llm/coding/"
      variant="secondary"
    />);
    const trigger = screen.getByRole('button', { name: 'Share Leaderboard' });

    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Share Leaderboard' });
    expect(screen.getByRole('textbox', { name: 'Share URL' }))
      .toHaveValue('https://tokenbench.monomind.one/leaderboards/llm/coding/');
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('copies only after explicit activation and keeps the dialog open on failure', async () => {
    const writeText = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<ShareAction
      label="Share Leaderboard"
      canonicalUrl="https://tokenbench.monomind.one/leaderboards/llm/coding/"
      variant="secondary"
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Share Leaderboard' }));

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied.');
    expect(writeText).toHaveBeenCalledWith('https://tokenbench.monomind.one/leaderboards/llm/coding/');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Copy failed. Select the URL and copy it manually.');
    expect(screen.getByRole('dialog', { name: 'Share Leaderboard' })).toBeInTheDocument();
  });

  it('traps focus and closes only for an actual backdrop press', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
    render(<ShareAction
      label="Share Leaderboard"
      canonicalUrl="https://tokenbench.monomind.one/leaderboards/llm/coding/"
      variant="secondary"
    />);
    const trigger = screen.getByRole('button', { name: 'Share Leaderboard' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Share Leaderboard' });
    const close = screen.getByRole('button', { name: 'Close share dialog' });
    const copy = screen.getByRole('button', { name: 'Copy' });

    copy.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(close).toHaveFocus();
    close.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(copy).toHaveFocus();

    fireEvent.mouseDown(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(dialog.parentElement!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
