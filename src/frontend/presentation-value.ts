import type { EvidenceValue, Provenance } from "./preview-data/contracts";

/**
 * A UI-ready evidence fact. Components may render `text` directly, use
 * `accessibleDescription` for an SR-only explanation or title, and inspect
 * the original value/source without replacing an unavailable fact.
 */
export type PresentationValue<T> = Readonly<{
  availability: "available" | "unavailable";
  value: T | null;
  text: string;
  reason: string | null;
  provenance: readonly Provenance[];
  accessibleDescription: string;
}>;

export type PresentationFormatter<T> = (value: T) => string;

function provenanceDescription(provenance: readonly Provenance[]): string | null {
  if (provenance.length === 0) return null;
  return provenance.map((source) => {
    const effective = source.effectiveAt === null ? "effective time unavailable" : `effective ${source.effectiveAt}`;
    return `${source.label} (${effective})`;
  }).join("; ");
}

/**
 * The one presentation semantic for evidence values. It never renders an
 * unavailable numeric/text fact as zero, a blank, or a fabricated fallback:
 * its display token is always `-`, while the reason and source stay available
 * to accessible UI affordances.
 */
export function presentEvidence<T>(
  evidence: EvidenceValue<T> | null | undefined,
  format: PresentationFormatter<T> = String,
  missingReason = "No published value is available.",
): PresentationValue<T> {
  if (evidence === undefined || evidence === null) {
    return {
      availability: "unavailable",
      value: null,
      text: "-",
      reason: missingReason,
      provenance: [],
      accessibleDescription: `Unavailable: ${missingReason}`,
    };
  }

  const provenance = evidence.availability === "available"
    ? [evidence.provenance]
    : evidence.provenance === undefined ? [] : [evidence.provenance];
  const sourceDescription = provenanceDescription(provenance);
  if (evidence.availability === "unavailable") {
    return {
      availability: "unavailable",
      value: null,
      text: "-",
      reason: evidence.reason,
      provenance,
      accessibleDescription: [
        `Unavailable: ${evidence.reason}`,
        sourceDescription === null ? null : `Source: ${sourceDescription}`,
      ].filter((item): item is string => item !== null).join(". "),
    };
  }

  return {
    availability: "available",
    value: evidence.value,
    text: format(evidence.value),
    reason: null,
    provenance,
    accessibleDescription: sourceDescription === null
      ? "Published value."
      : `Published value. Source: ${sourceDescription}.`,
  };
}
