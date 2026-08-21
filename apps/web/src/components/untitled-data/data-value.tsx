import type { ReactNode } from "react";

import type { Provenance } from "@tokenbench/frontend/preview-data/contracts";
import type { PresentationValue } from "@tokenbench/frontend/presentation-value";

import { cn } from "@/lib/utils";

export type { PresentationValue } from "@tokenbench/frontend/presentation-value";

export function unavailableValue<T = never>(
  reason = "This value was not supplied by the accepted source response.",
  provenance: readonly Provenance[] = [],
): PresentationValue<T> {
  return {
    accessibleDescription: `Unavailable: ${reason}`,
    availability: "unavailable",
    provenance,
    reason,
    text: "-",
    value: null,
  };
}

export function availableValue<T>(
  value: T,
  text: string,
  provenance: readonly Provenance[] = [],
): PresentationValue<T> {
  return {
    accessibleDescription: "Published value.",
    availability: "available",
    provenance,
    reason: null,
    text,
    value,
  };
}

export function DataValueText<T>({
  className,
  value,
}: {
  className?: string;
  value: PresentationValue<T>;
}): ReactNode {
  if (value.availability === "available") {
    return <span className={className}>{value.text}</span>;
  }

  return (
    <span
      aria-label={value.accessibleDescription}
      className={cn("cursor-help text-muted-foreground", className)}
      data-unavailable-value="true"
      title={value.accessibleDescription}
    >
      -
      <span className="sr-only">. {value.accessibleDescription}</span>
    </span>
  );
}

/** A compact bridge for legacy nullable view-model fields during migration. */
export function DataText<T>({
  className,
  format = String,
  reason,
  value,
}: {
  className?: string;
  format?: (value: T) => string;
  reason: string;
  value: T | null | undefined;
}): ReactNode {
  return (
    <DataValueText
      className={className}
      value={
        value === null || value === undefined
          ? unavailableValue(reason)
          : availableValue(value, format(value))
      }
    />
  );
}
