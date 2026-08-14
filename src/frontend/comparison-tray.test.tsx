import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompareProvider, useCompareState } from './compare-state';
import { ComparisonTray } from './comparison-tray';

function TrayHarness() {
  const { setSelection } = useCompareState();
  return <>
    <button type="button" onClick={() => setSelection({ ids: ['alpha'] })}>Select Alpha</button>
    <button type="button" onClick={() => setSelection({ ids: ['alpha', 'beta'] })}>Select Beta</button>
    <ComparisonTray />
  </>;
}

describe('ComparisonTray', () => {
  it('announces selections and removal without silently retaining a removed model', () => {
    render(<CompareProvider><TrayHarness /></CompareProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Select Alpha' }));
    expect(screen.getByRole('status')).toHaveTextContent('Added alpha to comparison');
    fireEvent.click(screen.getByRole('button', { name: 'Select Beta' }));

    expect(screen.getByRole('complementary', { name: 'Comparison tray' })).toHaveTextContent('alpha');
    expect(screen.getByRole('status')).toHaveTextContent('Added beta to comparison');
    fireEvent.click(screen.getByRole('button', { name: 'Remove beta from comparison' }));

    expect(screen.queryByRole('complementary', { name: 'Comparison tray' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Removed beta from comparison');
  });
});
