import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Chart, ChartConfiguration, ChartType } from 'chart.js';
import { useSiteTheme, type ThemeMode } from '../site-preferences';
import { chartThemeFor } from './chart-theme';
import { createTokenBenchChart } from './chart-js';

const CHART_FAILURE_MESSAGE = 'Chart unavailable. Exact values remain in the table.';

export interface ChartFailure {
  readonly kind: 'chart-failure';
  readonly message: typeof CHART_FAILURE_MESSAGE;
  readonly cause: unknown;
}

export interface TokenBenchChartCanvasProps<TType extends ChartType = ChartType> {
  readonly title: string;
  readonly finding: string;
  readonly configuration: ChartConfiguration<TType>;
  /** A stable view-model identity can be supplied when configuration is memoized. */
  readonly data?: unknown;
  /** Explicit theme is useful for SSR/tests; normal pages use the shared preference context. */
  readonly theme?: ThemeMode;
  readonly table?: ReactNode;
  readonly children?: ReactNode;
  readonly onFailure?: (failure: ChartFailure) => void;
  readonly className?: string;
}

function documentTheme(fallback: ThemeMode): ThemeMode {
  if (typeof document === 'undefined') return fallback;
  const value = document.documentElement.dataset.theme;
  return value === 'light' || value === 'dark' ? value : fallback;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

function themedConfiguration<TType extends ChartType>(
  configuration: ChartConfiguration<TType>,
  theme: ThemeMode,
  reducedMotion: boolean,
): ChartConfiguration<TType> {
  const palette = chartThemeFor(theme);
  const sourceOptions = (configuration.options ?? {}) as Record<string, unknown>;
  const sourceScales = (sourceOptions.scales ?? {}) as Record<string, Record<string, unknown>>;
  const scales = Object.fromEntries(Object.entries(sourceScales).map(([axis, scale]) => [axis, {
    ...scale,
    grid: { ...(scale.grid as Record<string, unknown> | undefined), color: palette.grid },
    ticks: { ...(scale.ticks as Record<string, unknown> | undefined), color: palette.text },
  }]));
  const sourcePlugins = (sourceOptions.plugins ?? {}) as Record<string, Record<string, unknown>>;
  const sourceLegend = sourcePlugins.legend ?? {};
  const sourceLabels = (sourceLegend.labels ?? {}) as Record<string, unknown>;

  return {
    ...configuration,
    options: {
      ...sourceOptions,
      color: sourceOptions.color ?? palette.text,
      borderColor: sourceOptions.borderColor ?? palette.grid,
      backgroundColor: sourceOptions.backgroundColor ?? palette.surface,
      animation: reducedMotion ? { duration: 0 } : sourceOptions.animation,
      plugins: {
        ...sourcePlugins,
        legend: {
          ...sourceLegend,
          labels: { ...sourceLabels, color: sourceLabels.color ?? palette.text },
        },
      },
      scales,
    },
  } as ChartConfiguration<TType>;
}

export function TokenBenchChartCanvas<TType extends ChartType = ChartType>({
  title,
  finding,
  configuration,
  data,
  theme: explicitTheme,
  table,
  children,
  onFailure,
  className,
}: TokenBenchChartCanvasProps<TType>) {
  const contextTheme = useSiteTheme();
  const theme = documentTheme(explicitTheme ?? contextTheme);
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseId = useId().replaceAll(':', '');
  const titleId = `${baseId}-title`;
  const findingId = `${baseId}-finding`;
  const tableId = `${baseId}-table`;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    setFailed(false);
    let chart: Chart<TType> | undefined;
    try {
      chart = createTokenBenchChart(canvas, themedConfiguration(configuration, theme, reducedMotion));
    } catch (cause) {
      setFailed(true);
      onFailure?.({ kind: 'chart-failure', message: CHART_FAILURE_MESSAGE, cause });
    }

    return () => {
      chart?.destroy();
    };
  }, [configuration, data, onFailure, reducedMotion, theme]);

  const tableContent = table ?? children;
  return <>
    <figure
      className={className}
      aria-labelledby={titleId}
      aria-describedby={`${findingId} ${tableId}`}
      data-chart-failed={failed ? 'true' : 'false'}
    >
      <figcaption id={titleId}>{title}</figcaption>
      <p id={findingId}>{finding}</p>
      {failed
        ? <p role="status">{CHART_FAILURE_MESSAGE}</p>
        : <canvas ref={canvasRef} />}
    </figure>
    {tableContent ? <div id={tableId}>{tableContent}</div> : <span id={tableId} hidden />}
  </>;
}
