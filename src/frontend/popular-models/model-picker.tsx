import { Plus, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { PopularModelFixture } from './types';

interface PopularModelPickerProps {
  readonly models: readonly PopularModelFixture[];
  readonly selectedCount: number;
  readonly max?: number;
  readonly onAdd: (modelId: string) => void;
}

export function PopularModelPicker({ models, selectedCount, max = 4, onAdd }: PopularModelPickerProps) {
  const generatedId = useId().replaceAll(':', '');
  const panelId = `popular-model-picker-${generatedId}`;
  const listboxId = `${panelId}-options`;
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const atLimit = selectedCount >= max;
  const filteredModels = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return models;
    return models.filter((model) => `${model.name} ${model.organization}`.toLocaleLowerCase().includes(needle));
  }, [models, query]);

  useEffect(() => {
    setActiveIndex((current) => filteredModels.length ? Math.min(current, filteredModels.length - 1) : -1);
  }, [filteredModels]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [open]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    if (restoreFocus) window.requestAnimationFrame(() => toggleRef.current?.focus());
  };

  const choose = (modelId: string) => {
    if (atLimit) return;
    onAdd(modelId);
    setQuery('');
    setActiveIndex(0);
    if (selectedCount + 1 >= max) close(true);
    else window.requestAnimationFrame(() => searchRef.current?.focus());
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(Math.max(current, -1) + 1, filteredModels.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(filteredModels.length ? 0 : -1);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(filteredModels.length - 1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      const model = filteredModels[activeIndex];
      if (model) choose(model.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
  };

  return <div className="popular-models-picker" ref={rootRef}>
    <button
      aria-controls={panelId}
      aria-expanded={open}
      aria-haspopup="dialog"
      className="button button-secondary popular-models-touch-target popular-models-picker-toggle"
      disabled={atLimit}
      onClick={() => setOpen((current) => !current)}
      ref={toggleRef}
      title={atLimit ? `${max} of ${max} models selected. Remove one to add another.` : 'Search and add a model'}
      type="button"
    ><Plus aria-hidden="true" size={16} />Add a model</button>
    {open ? <div aria-label="Add a model" className="popular-models-picker-panel" id={panelId} role="dialog">
      <label className="popular-models-picker-search">
        <Search aria-hidden="true" size={16} />
        <span className="popular-models-sr-only">Search models or organizations</span>
        <input
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded="true"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search models or organizations"
          ref={searchRef}
          role="combobox"
          type="search"
          value={query}
        />
      </label>
      <div aria-label="Available models" className="popular-models-picker-options" id={listboxId} role="listbox">
        {filteredModels.length ? filteredModels.map((model, index) => <button
          aria-selected={index === activeIndex}
          className="popular-models-picker-option"
          id={`${listboxId}-${index}`}
          key={model.id}
          onClick={() => choose(model.id)}
          onMouseEnter={() => setActiveIndex(index)}
          role="option"
          type="button"
        ><span><strong>{model.name}</strong><small>{model.organization} · {model.openWeights ? 'Open weights' : 'Closed'}</small></span></button>) : <p className="popular-models-picker-empty">No models match this search.</p>}
      </div>
      <p aria-live="polite" className="popular-models-picker-status" role="status">{filteredModels.length} model{filteredModels.length === 1 ? '' : 's'} available.</p>
    </div> : null}
  </div>;
}
