import { useMemo, useState, type KeyboardEvent } from 'react';
import { ProviderMark } from './provider-mark';

export type EvidenceStatus = 'supported' | 'estimated' | 'source_only';
export type SourceType = 'Proprietary' | 'Open Weight' | 'Unknown';

export interface DirectoryModel {
  readonly slug: string;
  readonly name: string;
  readonly creator: string;
  readonly sourceType: SourceType;
  readonly evidenceStatus: EvidenceStatus;
  readonly utilitySelectable: boolean;
  readonly metricCategories: readonly string[];
}

export interface DirectoryPair {
  readonly pairSlug: string;
  readonly modelASlug: string;
  readonly modelBSlug: string;
  readonly featuredRank: number | null;
  readonly sharedMetricCount: number;
}

export interface CompareDirectoryEnvelope {
  readonly revision: string;
  readonly publishedAt: string;
  readonly freshness: {
    readonly status: 'fresh' | 'stale';
    readonly checkedAt: string;
    readonly message?: string;
  };
  readonly data: {
    readonly compareDirectory: {
      readonly models: readonly DirectoryModel[];
      readonly indexablePairs: readonly DirectoryPair[];
    };
  };
}

type Picker = 'first' | 'second' | null;

function evidenceLabel(status: EvidenceStatus): string {
  if (status === 'supported') return 'Supported evidence';
  if (status === 'estimated') return 'Estimated evidence';
  return 'Source-only record';
}

function modelOptionLabel(model: DirectoryModel, duplicateNames: ReadonlySet<string>): string {
  const label = `${model.name} · ${model.creator}`;
  return duplicateNames.has(model.name) ? `${label} · ${model.slug}` : label;
}

export function popularModels(
  models: readonly DirectoryModel[],
  pairs: readonly DirectoryPair[],
  limit = 12,
): readonly DirectoryModel[] {
  const featured = new Map<string, number>();
  for (const pair of pairs) {
    const rank = pair.featuredRank ?? Number.MAX_SAFE_INTEGER;
    featured.set(pair.modelASlug, Math.min(featured.get(pair.modelASlug) ?? rank, rank));
    featured.set(pair.modelBSlug, Math.min(featured.get(pair.modelBSlug) ?? rank, rank));
  }
  return models.filter((model) => model.utilitySelectable).slice().sort((a, b) =>
    (featured.get(a.slug) ?? Number.MAX_SAFE_INTEGER) - (featured.get(b.slug) ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name)
      || a.slug.localeCompare(b.slug)).slice(0, limit);
}

export interface ModelPairPickerProps {
  readonly firstModelSlug: string;
  readonly idPrefix?: string;
  readonly models: readonly DirectoryModel[];
  readonly onFirstModelChange: (slug: string) => void;
  readonly onSecondModelChange: (slug: string) => void;
  readonly pairs: readonly DirectoryPair[];
  readonly secondModelSlug: string;
}

interface ModelPickerFieldProps {
  readonly activeOptionId: string | undefined;
  readonly activePicker: Picker;
  readonly idPrefix: string;
  readonly label: string;
  readonly onActivate: (picker: Exclude<Picker, null>) => void;
  readonly onBlur: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly onValueChange: (value: string) => void;
  readonly picker: Exclude<Picker, null>;
  readonly step: string;
  readonly value: string;
}

function ModelPickerField({
  activeOptionId,
  activePicker,
  idPrefix,
  label,
  onActivate,
  onBlur,
  onKeyDown,
  onValueChange,
  picker,
  step,
  value,
}: ModelPickerFieldProps) {
  const id = `${idPrefix}-${picker}-model`;
  const optionsId = `${idPrefix}-model-options`;

  return <div className="model-pair-picker-field">
    <span className="model-pair-picker-step">{step}</span>
    <label htmlFor={id}>{label}</label>
    <input
      aria-activedescendant={activePicker === picker ? activeOptionId : undefined}
      aria-autocomplete="list"
      aria-controls={optionsId}
      aria-expanded={activePicker === picker}
      aria-haspopup="listbox"
      id={id}
      onBlur={onBlur}
      onChange={(event) => onValueChange(event.currentTarget.value)}
      onFocus={() => onActivate(picker)}
      onKeyDown={onKeyDown}
      placeholder="Search models"
      role="combobox"
      type="search"
      value={value}
    />
    <p>Start with popular models, or search the full selectable directory.</p>
  </div>;
}

/**
 * A controlled model selector that can be shared by the comparison hub and
 * result-page quick switching without changing either page's selection state.
 */
export function ModelPairPicker({
  firstModelSlug,
  idPrefix = 'model-pair-picker',
  models,
  onFirstModelChange,
  onSecondModelChange,
  pairs,
  secondModelSlug,
}: ModelPairPickerProps) {
  const [activePicker, setActivePicker] = useState<Picker>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const utilityModels = useMemo(() => models.filter((model) => model.utilitySelectable), [models]);
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    utilityModels.forEach((model) => counts.set(model.name, (counts.get(model.name) ?? 0) + 1));
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }, [utilityModels]);
  const activeValue = activePicker === 'first' ? firstModelSlug : activePicker === 'second' ? secondModelSlug : '';
  const selectableModels = useMemo(() => {
    const query = activeValue.trim().toLocaleLowerCase();
    if (query === '') return popularModels(models, pairs);
    return utilityModels.filter((model) => [model.slug, model.name, model.creator]
      .some((value) => value.toLocaleLowerCase().includes(query)));
  }, [activeValue, models, pairs, utilityModels]);
  const activeOption = activeOptionIndex >= 0 ? selectableModels[activeOptionIndex] : undefined;
  const activeOptionId = activeOption ? `${idPrefix}-model-option-${activeOptionIndex}` : undefined;

  const activatePicker = (picker: Exclude<Picker, null>) => {
    setActivePicker(picker);
    setActiveOptionIndex(-1);
  };
  const updatePickerValue = (picker: Exclude<Picker, null>, value: string) => {
    if (picker === 'first') onFirstModelChange(value);
    else onSecondModelChange(value);
    setActivePicker(picker);
    setActiveOptionIndex(-1);
  };
  const chooseModel = (model: DirectoryModel, picker = activePicker) => {
    if (picker === 'first') onFirstModelChange(model.slug);
    if (picker === 'second') onSecondModelChange(model.slug);
    setActivePicker(null);
    setActiveOptionIndex(-1);
  };
  const handleComboboxKeyDown = (picker: Exclude<Picker, null>, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setActivePicker(null);
      setActiveOptionIndex(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (selectableModels.length === 0) return;
      setActivePicker(picker);
      setActiveOptionIndex((currentIndex) => {
        if (event.key === 'ArrowDown') return currentIndex < 0 ? 0 : Math.min(currentIndex + 1, selectableModels.length - 1);
        return currentIndex < 0 ? selectableModels.length - 1 : Math.max(currentIndex - 1, 0);
      });
      return;
    }
    if (event.key === 'Enter') {
      const value = picker === 'first' ? firstModelSlug : secondModelSlug;
      const exactMatch = selectableModels.find((model) => model.slug === value);
      const model = activePicker === picker && activeOptionIndex >= 0 ? selectableModels[activeOptionIndex] : exactMatch;
      if (model) {
        event.preventDefault();
        chooseModel(model, picker);
      }
    }
  };

  return <div className="model-pair-picker" data-combobox-open={activePicker === null ? 'false' : 'true'}>
    <div className="model-pair-picker-grid">
      <ModelPickerField activeOptionId={activeOptionId} activePicker={activePicker} idPrefix={idPrefix} label="First model" onActivate={activatePicker} onBlur={() => { setActivePicker(null); setActiveOptionIndex(-1); }} onKeyDown={(event) => handleComboboxKeyDown('first', event)} onValueChange={(value) => updatePickerValue('first', value)} picker="first" step="Step 1" value={firstModelSlug} />
      <ModelPickerField activeOptionId={activeOptionId} activePicker={activePicker} idPrefix={idPrefix} label="Second model" onActivate={activatePicker} onBlur={() => { setActivePicker(null); setActiveOptionIndex(-1); }} onKeyDown={(event) => handleComboboxKeyDown('second', event)} onValueChange={(value) => updatePickerValue('second', value)} picker="second" step="Step 2" value={secondModelSlug} />
    </div>
    {activePicker ? <ul aria-label="Available models" className="model-pair-picker-options" id={`${idPrefix}-model-options`} role="listbox">
      {selectableModels.map((model, index) => <li aria-label={modelOptionLabel(model, duplicateNames)} aria-selected={(activePicker === 'second' ? secondModelSlug : firstModelSlug) === model.slug} data-active={activeOption?.slug === model.slug} id={`${idPrefix}-model-option-${index}`} key={model.slug} onClick={() => chooseModel(model)} onMouseDown={(event) => event.preventDefault()} role="option">
        <ProviderMark decorative providerId={model.creator} providerName={model.creator} size={20} />
        <span className="model-pair-picker-option-identity"><strong>{model.name}</strong><span>{model.creator}</span></span>
        <span className="model-pair-picker-option-evidence">{evidenceLabel(model.evidenceStatus)}</span>
      </li>)}
    </ul> : null}
    {activePicker && selectableModels.length === 0 ? <p className="comparison-empty-copy">No selectable models match that search.</p> : null}
  </div>;
}
