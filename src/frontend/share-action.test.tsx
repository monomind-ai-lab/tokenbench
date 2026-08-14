import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareAction } from './share-action';

afterEach(() => vi.unstubAllGlobals());

describe('ShareAction', () => {
  it('opens a URL-copy popup instead of the native share modal', () => {
    render(<ShareAction url="https://tokenbench.monomind.one/compare/a-vs-b" title="A vs B" />);

    expect(screen.queryByRole('dialog', { name: 'Share A vs B' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Share result' }));

    const dialog = screen.getByRole('dialog', { name: 'Share A vs B' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText('Shareable link')).toHaveValue('https://tokenbench.monomind.one/compare/a-vs-b');
  });

  it('reports one explicit share creation without exposing the URL to its callback', () => {
    const onShared = vi.fn();
    render(<ShareAction url="https://tokenbench.monomind.one/cost/breakeven/?v=2" title="Breakeven" onShared={onShared} />);

    fireEvent.click(screen.getByRole('button', { name: 'Share result' }));

    expect(onShared).toHaveBeenCalledTimes(1);
    expect(onShared).toHaveBeenCalledWith();
  });

  it('copies the URL from the popup and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<ShareAction url="https://tokenbench.monomind.one/compare/a-vs-b" title="A vs B" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share result' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Link copied to clipboard.');
    expect(writeText).toHaveBeenCalledWith('https://tokenbench.monomind.one/compare/a-vs-b');
  });

  it('announces an accessible failure when the clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {});

    render(<ShareAction url="https://tokenbench.monomind.one/compare/a-vs-b" title="A vs B" label="Share comparison" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share comparison' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to copy the link. Please copy the URL from your browser.');
  });

  it('closes the popup with Escape', () => {
    render(<ShareAction url="https://tokenbench.monomind.one/compare/a-vs-b" title="A vs B" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share result' }));
    expect(screen.getByRole('dialog', { name: 'Share A vs B' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Share A vs B' })).not.toBeInTheDocument();
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
