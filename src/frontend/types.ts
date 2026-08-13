import type { CatalogResponse, PlanOffer } from '../catalog/contracts';
import type { ConversationWorkload } from '../catalog/subscription-api-calculator';
import type { CalculatorSnapshot, InitialSelection } from './calculator-state';

export interface CalculatorControlsProps {
  readonly catalog: CatalogResponse;
  readonly providerIds: string[];
  readonly selectedProviderId: string;
  readonly selectedPlanId: string;
  readonly selectedModelIds: string[];
  readonly modelMixBasisPoints: Record<string, number>;
  readonly workload: ConversationWorkload;
  readonly onProviderChange: (providerId: string) => void;
  readonly onPlanChange: (planId: string) => void;
  readonly onModelToggle: (modelId: string) => void;
  readonly onModelShareChange: (modelId: string, shareBasisPoints: number) => void;
  readonly onWorkloadChange: (workload: ConversationWorkload) => void;
  readonly onMappingModeChange: (mode: 'default' | 'override') => void;
}

export interface ResultsDashboardProps {
  readonly selectedPlan?: PlanOffer;
  readonly snapshot: CalculatorSnapshot;
  readonly hasAvailableModels: boolean;
  readonly catalog?: CatalogResponse;
}

export interface EmptySelectionProps {
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export type SelectionState = InitialSelection;
