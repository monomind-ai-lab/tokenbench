"use client";

import { Check, Clipboard, Download, Grid2X2, ImageDown, List, Printer } from "lucide-react";
import { toPng } from "html-to-image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CsvCell = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvCell>;

type Feedback = "copied" | "csv" | "image" | "error" | null;

function csvValue(value: CsvCell) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const formulaSafe = /^[\t\r\n=+\-@]|^ +[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(formulaSafe) ? `"${formulaSafe.replaceAll('"', '""')}"` : formulaSafe;
}

export function rowsToCsv(rows: CsvRow[]) {
  if (!rows.length) return "";
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [headers.map(csvValue).join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))].join("\r\n");
}

export function csvDownloadText(rows: CsvRow[]) {
  return `\uFEFF${rowsToCsv(rows)}`;
}

export function resultImageOptions(backgroundColor: string, pixelRatio: number) {
  return {
    backgroundColor,
    cacheBust: true,
    filter: (node: Node) => !(node instanceof HTMLElement && node.dataset.exportAction === "true"),
    pixelRatio,
  };
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = dataUrl;
  anchor.click();
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  URL.revokeObjectURL(url);
}

export function ResultActions({
  targetId,
  filename,
  rows,
  includePrint = false,
  label = "Share and export result",
}: {
  targetId: string;
  filename: string;
  rows: CsvRow[];
  includePrint?: boolean;
  label?: string;
}) {
  const [feedback, setFeedback] = useState<Feedback>(null);

  const run = async (task: () => Promise<Feedback> | Feedback) => {
    setFeedback(null);
    try {
      setFeedback(await task());
    } catch {
      setFeedback("error");
    }
  };

  const copyLink = () => run(async () => {
    const url = window.location.href;
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else {
      const input = document.createElement("textarea");
      input.value = url;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    return "copied" as const;
  });

  const downloadImage = () => run(async () => {
    const node = document.getElementById(targetId);
    if (!node) throw new Error("Result section not found");
    const backgroundColor = getComputedStyle(document.body).backgroundColor;
    const dataUrl = await toPng(node, resultImageOptions(backgroundColor, Math.min(window.devicePixelRatio || 1, 2)));
    downloadDataUrl(dataUrl, `${filename}.png`);
    return "image" as const;
  });

  const downloadCsv = () => run(() => {
    downloadText(csvDownloadText(rows), `${filename}.csv`);
    return "csv" as const;
  });

  return (
    <div aria-label={label} className="flex flex-wrap items-center gap-2" data-export-action="true" role="group">
      <Button className="min-h-11" onClick={copyLink} size="sm" variant="outline"><Clipboard />Copy link</Button>
      <Button className="min-h-11" onClick={downloadImage} size="sm" variant="outline"><ImageDown />Download image</Button>
      <Button className="min-h-11" onClick={downloadCsv} size="sm" variant="outline"><Download />Export CSV</Button>
      {includePrint ? <Button className="min-h-11" onClick={() => window.print()} size="sm" variant="outline"><Printer />Print</Button> : null}
      <span aria-live="polite" className={cn("min-h-5 text-xs text-muted-foreground", feedback === "error" && "text-destructive")}>
        {feedback === "copied" ? <span className="flex items-center gap-1"><Check className="size-3" />Link copied</span> : null}
        {feedback === "csv" ? "CSV downloaded" : null}
        {feedback === "image" ? "Image downloaded" : null}
        {feedback === "error" ? "That export could not be completed." : null}
      </span>
    </div>
  );
}

export function ViewModeToggle({ mode, onChange, label = "Result view" }: { mode: "cards" | "list"; onChange: (mode: "cards" | "list") => void; label?: string }) {
  return (
    <div aria-label={label} className="inline-flex rounded-xl border border-border bg-card p-1" role="group">
      <button aria-pressed={mode === "cards"} className={cn("flex min-h-11 items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors", mode === "cards" && "bg-muted text-foreground")} onClick={() => onChange("cards")} type="button"><Grid2X2 className="size-3.5" />Cards</button>
      <button aria-pressed={mode === "list"} className={cn("flex min-h-11 items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors", mode === "list" && "bg-muted text-foreground")} onClick={() => onChange("list")} type="button"><List className="size-3.5" />List</button>
    </div>
  );
}
