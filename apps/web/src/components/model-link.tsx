import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Canonical route for a model's evidence profile.
 *
 * Every model identifier reaching this helper must be the source-safe ID or slug
 * that the published contract uses. Display names are never a valid input: they
 * are not stable join keys and cannot be reconstructed into a route.
 */
export function modelProfileHref(modelId: string): string {
  return `/model-profile?model=${encodeURIComponent(modelId)}`;
}

/**
 * A model name is navigation, not a decorative label.
 *
 * DESIGN.md requires every model name rendered in a result surface — table cell,
 * card title, tray chip, comparison column — to reach the canonical profile
 * through this one component, so the route, focus behaviour, and unknown-model
 * handling stay identical everywhere.
 *
 * When `modelId` is absent the name renders as plain text rather than a broken
 * link, because a model we cannot address is not navigable.
 */
export function ModelLink({
  className,
  modelId,
  name,
}: {
  readonly className?: string;
  readonly modelId: string | null | undefined;
  readonly name: string;
}) {
  if (!modelId) return <>{name}</>;
  return (
    <Link
      className={cn(
        "rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      href={modelProfileHref(modelId)}
    >
      {name}
    </Link>
  );
}
