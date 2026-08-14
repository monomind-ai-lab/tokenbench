import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InspectionCard, type InspectionRecord } from './inspection-card';

const sourceOnlyRecord: InspectionRecord = {
  modelId: 'm1', modelSlug: 'model-one', modelName: 'Model One', provider: 'Provider', host: null,
  inputPrice: null, outputPrice: null, cachePrice: null, ttft: null,
  throughput: null, context: null, capability: null, evidenceStatus: 'source_only',
  sourceLabel: 'BenchLM', sourceUrl: 'https://benchlm.ai/', effectiveAt: null,
};

function FocusHarness({ onClose }: { readonly onClose: () => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={triggerRef} type="button">Inspect Model One</button>
    <InspectionCard record={sourceOnlyRecord} onClose={onClose} returnFocusRef={triggerRef} />
  </>;
}

describe('InspectionCard', () => {
  it('keeps unavailable facts explicit and links only from the supplied model slug', () => {
    const onClose = vi.fn();
    render(<InspectionCard record={sourceOnlyRecord} onClose={onClose} />);

    expect(screen.getAllByText('Not reported').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Model One profile/i })).toHaveAttribute('href', '/models/model-one/');
    expect(screen.getByRole('link', { name: 'View BenchLM source' })).toHaveClass('button');
  });

  it('returns focus to the inspection trigger when Escape dismisses the card', () => {
    const onClose = vi.fn();
    render(<FocusHarness onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Inspect Model One' })).toHaveFocus();
  });
});
