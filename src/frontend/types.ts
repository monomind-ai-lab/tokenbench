import type { CatalogResponse, PlanOffer } from '../catalog/contracts';
import type { InitialSelection, WorkloadPreset } from './calculator-state';

export interface CalculatorControlsProps {
  readonly catalog: CatalogResponse;
  readonly providerIds: string[];
  readonly selectedProviderId: string;
  readonly selectedPlanId: string;
  readonly selectedModelIds: string[];
  readonly modelMixBasisPoints: Record<string, number>;
  readonly inputShareBasisPoints: number;
  readonly monthlyTokens: number;
  readonly selectedPreset: WorkloadPreset | null;
  readonly onProviderChange: (providerId: string) => void;
  readonly onPlanChange: (planId: string) => void;
  readonly onModelToggle: (modelId: string) => void;
  readonly onModelShareChange: (modelId: string, shareBasisPoints: number) => void;
  readonly onInputShareChange: (value: number) => void;
  readonly onMonthlyTokensChange: (value: number) => void;
  readonly onPresetChange: (preset: WorkloadPreset) => void;
}

export interface ResultsDashboardProps {
  readonly selectedPlan?: PlanOffer;
  readonly snapshot: ReturnType<typeof import('./calculator-state').buildCalculatorSnapshot>;
}

export interface EmptySelectionProps {
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export type SelectionState = InitialSelection;
