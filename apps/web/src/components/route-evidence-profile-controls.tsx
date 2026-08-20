"use client";

import { GitCompareArrows } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

function pairHref(left: string, right: string): string {
  const pair = `${left}-vs-${right}`;
  return `/compare/${encodeURIComponent(pair)}?models=${encodeURIComponent(left)},${encodeURIComponent(right)}`;
}

export function RouteEvidenceProfileControls({ slug }: { slug: string }) {
  const router = useRouter();
  const [partner, setPartner] = useState("");
  const normalizedPartner = partner.trim().toLowerCase();
  const canSubmit = normalizedPartner.length > 0 && normalizedPartner !== slug;

  return (
    <form
      className="flex w-full max-w-xl flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) router.push(pairHref(slug, normalizedPartner));
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Model slug to compare with {slug}</span>
        <input
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => setPartner(event.target.value)}
          placeholder="Compare with a model slug"
          type="text"
          value={partner}
        />
      </label>
      <Button className="min-h-11" disabled={!canSubmit} type="submit">
        <GitCompareArrows />
        Compare pair
      </Button>
    </form>
  );
}
