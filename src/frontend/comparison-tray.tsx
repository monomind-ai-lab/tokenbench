import { useEffect, useRef, useState } from 'react';
import { ROUTE_PATHS } from '../routing/routes';
import { trackTokenBenchEvent } from './analytics';
import { removeCompareModel, useCompareState } from './compare-state';

export function ComparisonTray() {
  const { selection, setSelection } = useCompareState();
  const previousIds = useRef(selection.ids);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const previous = previousIds.current;
    const added = selection.ids.find((id) => !previous.includes(id));
    const removed = previous.find((id) => !selection.ids.includes(id));
    if (added) setAnnouncement(`Added ${added} to comparison`);
    if (removed) setAnnouncement(`Removed ${removed} from comparison`);
    previousIds.current = selection.ids;
  }, [selection.ids]);

  const remove = (id: string) => {
    setSelection((current) => removeCompareModel(current, id));
    trackTokenBenchEvent('compare_model_removed', { modelId: id, route: window.location.pathname });
  };

  return <>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    {selection.ids.length >= 2 ? <aside className="comparison-tray" aria-label="Comparison tray">
      <div>
        <strong>{`${selection.ids.length} models selected`}</strong>
        <ul aria-label="Selected comparison models">{selection.ids.map((id) => <li key={id}>
          <span>{id}</span>
          <button className="button button-secondary button-small" type="button" onClick={() => remove(id)}>{`Remove ${id} from comparison`}</button>
        </li>)}</ul>
      </div>
      <a className="button" href={ROUTE_PATHS.compareHub}>Continue to compare</a>
    </aside> : null}
  </>;
}
