export type ModelIdentityMatchKind = 'exact' | 'reviewed' | 'proposal';

export interface ModelSourceIdentity {
  readonly sourceId: string;
  readonly sourceModelId: string;
  readonly modelConfigurationId: string | null;
  readonly matchKind: ModelIdentityMatchKind;
  readonly reviewStatus: 'verified' | 'needs_review' | 'rejected';
  readonly reviewedBy: string | null;
  readonly evidenceUrl: string | null;
  readonly effectiveFromRevision: string;
  readonly effectiveToRevision: string | null;
}

function hasNonEmptyString(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function publishableModelIdentity(value: ModelSourceIdentity): boolean {
  if (value.effectiveToRevision !== null
    || value.reviewStatus !== 'verified'
    || !hasNonEmptyString(value.modelConfigurationId)) return false;
  if (value.matchKind === 'exact') return true;
  return value.matchKind === 'reviewed'
    && hasNonEmptyString(value.reviewedBy)
    && hasNonEmptyString(value.evidenceUrl)
    && hasNonEmptyString(value.effectiveFromRevision);
}
