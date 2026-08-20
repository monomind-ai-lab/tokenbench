"use client";

import { Check, Copy, Shuffle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

function pairHref(left: string, right: string): string {
  const pair = `${left}-vs-${right}`;
  return `/compare/${encodeURIComponent(pair)}?models=${encodeURIComponent(left)},${encodeURIComponent(right)}`;
}

export function RouteEvidencePairControls({
  left,
  right,
}: {
  left: string;
  right: string;
}) {
  const router = useRouter();
  const [nextLeft, setNextLeft] = useState(left);
  const [nextRight, setNextRight] = useState(right);
  const [copied, setCopied] = useState(false);
  const normalizedLeft = nextLeft.trim().toLowerCase();
  const normalizedRight = nextRight.trim().toLowerCase();
  const canSwitch = normalizedLeft.length > 0 && normalizedRight.length > 0 && normalizedLeft !== normalizedRight;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Pair controls">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Switch or share this pair</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">The route keeps the displayed order in both the path and its models query.</p>
        </div>
        <Button onClick={copy} size="sm" type="button" variant="outline">
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <form
        className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSwitch) router.push(pairHref(normalizedLeft, normalizedRight));
        }}
      >
        <label>
          <span className="sr-only">First model slug</span>
          <input
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setNextLeft(event.target.value)}
            value={nextLeft}
          />
        </label>
        <label>
          <span className="sr-only">Second model slug</span>
          <input
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setNextRight(event.target.value)}
            value={nextRight}
          />
        </label>
        <Button disabled={!canSwitch} type="submit" variant="outline">
          <Shuffle />
          Switch pair
        </Button>
      </form>
    </section>
  );
}
