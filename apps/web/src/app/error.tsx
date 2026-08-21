"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
      <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-7 shadow-soft sm:p-10" role="alert">
        <CircleAlert aria-hidden="true" className="size-7 text-destructive" />
        <p className="mt-5 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Evidence surface interrupted</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">This result could not be rendered.</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Retry the same request. If the source is temporarily unavailable, TokenBench will keep missing facts explicit rather than substitute another dataset.
        </p>
        <Button className="mt-7 min-h-11" onClick={reset} type="button">
          <RotateCcw />
          Retry result
        </Button>
      </section>
    </main>
  );
}
