import { Chart, registerables, type ChartConfiguration, type ChartType } from 'chart.js';

// Register the complete Chart.js surface once when this bundled adapter loads.
Chart.register(...registerables);

export function createTokenBenchChart<TType extends ChartType>(
  canvas: HTMLCanvasElement,
  configuration: ChartConfiguration<TType>,
): Chart<TType> {
  return new Chart(canvas, configuration);
}
