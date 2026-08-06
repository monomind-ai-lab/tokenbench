import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModelPairPicker, popularModels, type DirectoryModel, type DirectoryPair } from './model-pair-picker';

const models: readonly DirectoryModel[] = [
  { slug: 'alpha', name: 'Alpha', creator: 'Provider A', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['coding'] },
  { slug: 'beta', name: 'Beta', creator: 'Provider B', sourceType: 'Proprietary', evidenceStatus: 'estimated', utilitySelectable: true, metricCategories: ['coding'] },
  { slug: 'gamma', name: 'Gamma', creator: 'Provider C', sourceType: 'Open Weight', evidenceStatus: 'source_only', utilitySelectable: true, metricCategories: ['multimodal'] },
  { slug: 'hidden', name: 'Hidden', creator: 'Provider D', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: false, metricCategories: ['coding'] },
];

const pairs: readonly DirectoryPair[] = [
  { pairSlug: 'beta-vs-gamma', modelASlug: 'beta', modelBSlug: 'gamma', featuredRank: 2, sharedMetricCount: 2 },
  { pairSlug: 'alpha-vs-gamma', modelASlug: 'alpha', modelBSlug: 'gamma', featuredRank: 1, sharedMetricCount: 2 },
  { pairSlug: 'hidden-vs-gamma', modelASlug: 'hidden', modelBSlug: 'gamma', featuredRank: 1, sharedMetricCount: 2 },
];

function ControlledPicker({
  pickerModels = models,
  pickerPairs = pairs,
}: {
  readonly pickerModels?: readonly DirectoryModel[];
  readonly pickerPairs?: readonly DirectoryPair[];
}) {
  const [firstModelSlug, setFirstModelSlug] = useState('');
  const [secondModelSlug, setSecondModelSlug] = useState('');

  return <ModelPairPicker
    firstModelSlug={firstModelSlug}
    models={pickerModels}
    onFirstModelChange={setFirstModelSlug}
    onSecondModelChange={setSecondModelSlug}
    pairs={pickerPairs}
    secondModelSlug={secondModelSlug}
  />;
}

describe('popularModels', () => {
  it('orders selectable models by their best featured pair rank before deterministic labels', () => {
    expect(popularModels(models, pairs, 3).map((model) => model.slug)).toEqual(['alpha', 'gamma', 'beta']);
  });
});

describe('ModelPairPicker', () => {
  it('includes each model evidence state in its option accessible name', () => {
    render(<ControlledPicker />);

    fireEvent.focus(screen.getByRole('combobox', { name: 'First model' }));

    expect(screen.getByRole('option', { name: 'Alpha · Provider A · Supported evidence' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Beta · Provider B · Estimated evidence' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Gamma · Provider C · Source-only record' })).toBeInTheDocument();
  });

  it('updates its controlled model values through the keyboard listbox pattern', () => {
    render(<ControlledPicker />);

    const first = screen.getByRole('combobox', { name: 'First model' });
    const second = screen.getByRole('combobox', { name: 'Second model' });
    fireEvent.focus(first);
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    fireEvent.keyDown(first, { key: 'Enter' });
    fireEvent.focus(second);
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    fireEvent.keyDown(second, { key: 'Enter' });

    expect(first).toHaveValue('alpha');
    expect(second).toHaveValue('beta');
    fireEvent.focus(first);
    expect(screen.getByText('Provider A')).toBeInTheDocument();
    expect(screen.getByText('Supported evidence')).toBeInTheDocument();
  });

  it('disambiguates duplicate display names with canonical slugs', () => {
    const duplicateModels: readonly DirectoryModel[] = [
      { slug: 'shared-a', name: 'Shared', creator: 'Provider A', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['coding'] },
      { slug: 'shared-b', name: 'Shared', creator: 'Provider B', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['coding'] },
    ];
    render(<ControlledPicker pickerModels={duplicateModels} pickerPairs={[]} />);

    fireEvent.focus(screen.getByRole('combobox', { name: 'First model' }));

    expect(screen.getByRole('option', { name: 'Shared · Provider A · shared-a · Supported evidence' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Shared · Provider B · shared-b · Supported evidence' })).toBeInTheDocument();
  });

  it('searches every selectable model after typing rather than only the popular rows', () => {
    const allModels: readonly DirectoryModel[] = [
      ...Array.from({ length: 12 }, (_, index) => ({
        slug: `featured-${index}`,
        name: `Featured ${index}`,
        creator: 'Provider',
        sourceType: 'Proprietary' as const,
        evidenceStatus: 'supported' as const,
        utilitySelectable: true,
        metricCategories: ['coding'],
      })),
      { slug: 'outside-popular', name: 'Outside Popular', creator: 'Provider', sourceType: 'Open Weight', evidenceStatus: 'source_only', utilitySelectable: true, metricCategories: ['multimodal'] },
    ];
    render(<ControlledPicker pickerModels={allModels} pickerPairs={[]} />);

    const first = screen.getByRole('combobox', { name: 'First model' });
    fireEvent.focus(first);
    expect(screen.queryByRole('option', { name: /Outside Popular/ })).not.toBeInTheDocument();
    fireEvent.change(first, { target: { value: 'outside' } });

    expect(screen.getByRole('option', { name: 'Outside Popular · Provider · Source-only record' })).toBeInTheDocument();
  });
});
