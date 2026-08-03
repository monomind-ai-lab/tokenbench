import type { CatalogResponse, ModelOffer, PlanOffer } from '../catalog/contracts';
import type { InitialSelection, WorkloadPreset } from './calculator-state';

export interface CalculatorControlsProps {
  catalog: CatalogResponse;
  providerIds: string[];
  selectedProviderId: string;
  selectedPlanId: string;
  selectedModelIds: string[];
  modelMixBasisPoints: Record<string, number>;
  inputShareBasisPoints: number;
  monthlyTokens: number;
  onProviderChange(providerId: string): void;
  onPlanChange(planId: string): void;
  onModelToggle(modelId: string): void;
  onModelShareChange(modelId: string, shareBasisPoints: number): void;
  onInputShareChange(value: number): void;
  onMonthlyTokensChange(value: number): void;
  onPresetChange(preset: WorkloadPreset): void;
}

export interface ResultsDashboardProps {
  catalog: CatalogResponse;
  selectedProviderId: string;
  selectedPlan?: PlanOffer;
  selectedModelOffers: ModelOffer[];
  snapshot: ReturnType<typeof import('./calculator-state').buildCalculatorSnapshot>;
}

export interface EmptySelectionProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export type SelectionState = InitialSelection;
