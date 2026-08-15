import { useEffect, useRef } from 'react';
import {
  Chart,
  registerables,
  type ChartConfiguration,
  type ChartType,
} from 'chart.js';

Chart.register(...registerables);

interface PopularChartCanvasProps<TType extends ChartType> {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly configuration: ChartConfiguration<TType>;
}

export function PopularChartCanvas<TType extends ChartType>({
  ariaLabel,
  className = '',
  configuration,
}: PopularChartCanvasProps<TType>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const chart = new Chart(canvas, {
      ...configuration,
      options: {
        ...configuration.options,
        animation: reducedMotion ? false : configuration.options?.animation,
      },
    });

    return () => chart.destroy();
  }, [configuration]);

  return <canvas ref={canvasRef} className={className} role="img" aria-label={ariaLabel} />;
}
