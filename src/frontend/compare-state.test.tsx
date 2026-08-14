import { fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CompareProvider, addCompareModel, decodeCompareSearch, removeCompareModel, useCompareState } from './compare-state';

function SelectionProbe() {
  const { selection, setSelection } = useCompareState();
  return <>
    <output>{selection.ids.join(',')}</output>
    <button type="button" onClick={() => setSelection({ ids: ['replacement'] })}>Replace selection</button>
  </>;
}

describe('addCompareModel', () => {
  it('requires an explicit replacement instead of silently dropping a selected model', () => {
    expect(addCompareModel({ ids: ['a', 'b', 'c'] }, 'd')).toEqual({
      kind: 'replacement_required',
      state: { ids: ['a', 'b', 'c'] },
      incomingId: 'd',
    });
  });

  it('keeps an already selected stable model ID unchanged', () => {
    expect(addCompareModel({ ids: ['a', 'b'] }, 'b')).toEqual({
      kind: 'duplicate',
      state: { ids: ['a', 'b'] },
    });
  });

  it('decodes at most three distinct stable IDs and removes exactly the chosen ID', () => {
    const selection = decodeCompareSearch('?compare=alpha,alpha,email@example.com,beta,gamma,delta');

    expect(selection).toEqual({ ids: ['alpha', 'beta', 'gamma'] });
    expect(removeCompareModel(selection, 'beta')).toEqual({ ids: ['alpha', 'gamma'] });
  });

  it('shares the browser selection through the provider without changing its SSR default', () => {
    window.history.replaceState({}, '', '/models/?compare=alpha,beta');
    render(<CompareProvider><SelectionProbe /></CompareProvider>);

    expect(screen.getByText('alpha,beta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Replace selection' }));
    expect(screen.getByText('replacement')).toBeInTheDocument();

    vi.stubGlobal('window', undefined);
    try {
      expect(renderToString(<CompareProvider><span>SSR safe</span></CompareProvider>)).toContain('SSR safe');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
