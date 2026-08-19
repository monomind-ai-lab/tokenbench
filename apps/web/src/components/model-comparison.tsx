"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Layers2,
  Server,
} from "lucide-react";
import type React from "react";
import { type SVGProps, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SORT_OPTIONS = [
  { field: "name", label: "Name" },
  { field: "contextWindow", label: "Context" },
  { field: "pricing", label: "Price" },
  { field: "reasoning", label: "Reasoning" },
  { field: "speed", label: "Speed" },
] as const;

const PROVIDER_OPTIONS = [
  { value: "all", label: "All providers" },
  { value: "OpenAI", label: "OpenAI" },
  { value: "Anthropic", label: "Anthropic" },
  { value: "Google", label: "Google" },
  { value: "xAI", label: "xAI" },
  { value: "DeepSeek", label: "DeepSeek" },
  { value: "Meta", label: "Meta" },
  { value: "Mistral", label: "Mistral" },
  { value: "Perplexity", label: "Perplexity" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  { value: "flagship", label: "Flagship" },
  { value: "balanced", label: "Balanced" },
  { value: "fast", label: "Fast" },
  { value: "embedding", label: "Embedding" },
  { value: "code", label: "Code" },
  { value: "open-source", label: "Open source" },
] as const;

const INITIAL_VISIBLE_COUNT = 6;
const PAGE_SIZE = 6;

export function ModelComparison() {
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("reasoning");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const filterKey = `${selectedProvider}:${selectedCategory}:${sortField}:${sortOrder}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);

  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }

  const filteredAndSortedModels = useMemo(() => {
    let filtered = models;

    if (selectedProvider !== "all") {
      filtered = filtered.filter((m) => m.provider === selectedProvider);
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter((m) =>
        m.category.toLowerCase().includes(selectedCategory)
      );
    }

    return filtered.sort((a, b) => {
      let aVal: number, bVal: number;

      switch (sortField) {
        case "name":
          return sortOrder === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        case "contextWindow":
          aVal = a.contextWindow;
          bVal = b.contextWindow;
          break;
        case "pricing":
          aVal = a.pricing.input;
          bVal = b.pricing.input;
          break;
        case "reasoning":
          aVal = a.performance.reasoning;
          bVal = b.performance.reasoning;
          break;
        case "speed":
          aVal = a.performance.speed;
          bVal = b.performance.speed;
          break;
        default: {
          const _exhaustive: never = sortField;
          return _exhaustive;
        }
      }

      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [selectedProvider, selectedCategory, sortField, sortOrder]);

  const visibleModels = filteredAndSortedModels.slice(0, visibleCount);
  const remainingCount = filteredAndSortedModels.length - visibleModels.length;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const showMore = () => {
    setVisibleCount((current) =>
      Math.min(current + PAGE_SIZE, filteredAndSortedModels.length)
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-8 sm:mb-12">
        <Badge className="mb-4 font-mono text-xs" variant="secondary">
          AI Model Comparison
        </Badge>
        <h2 className="mb-3 text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
          Compare Leading AI Models
        </h2>
        <p className="max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed sm:text-base">
          Side-by-side comparison of GPT-4, Claude, and Gemini with performance
          metrics, pricing, and capabilities
        </p>
      </div>

      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <div className="min-w-0 space-y-1.5 sm:w-[180px]">
              <Label
                className="text-muted-foreground text-xs"
                htmlFor="model-provider-filter"
              >
                Provider
              </Label>
              <Select
                onValueChange={(value) => setSelectedProvider(value ?? "all")}
                value={selectedProvider}
              >
                <SelectTrigger
                  className="w-full"
                  id="model-provider-filter"
                  size="sm"
                >
                  <Server className="size-3.5 shrink-0 text-muted-foreground" />
                  <SelectValue>
                    {(value: string | null) =>
                      PROVIDER_OPTIONS.find((option) => option.value === value)
                        ?.label ?? "All providers"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-1.5 sm:w-[180px]">
              <Label
                className="text-muted-foreground text-xs"
                htmlFor="model-category-filter"
              >
                Category
              </Label>
              <Select
                onValueChange={(value) => setSelectedCategory(value ?? "all")}
                value={selectedCategory}
              >
                <SelectTrigger
                  className="w-full"
                  id="model-category-filter"
                  size="sm"
                >
                  <Layers2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <SelectValue>
                    {(value: string | null) =>
                      CATEGORY_OPTIONS.find((option) => option.value === value)
                        ?.label ?? "All categories"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-muted-foreground text-xs tabular-nums sm:pb-2">
            {remainingCount > 0
              ? `Showing ${visibleModels.length} of ${filteredAndSortedModels.length}`
              : `${filteredAndSortedModels.length} models`}
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs">Sort by</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            {SORT_OPTIONS.map((option) => {
              const isActive = sortField === option.field;
              let SortIcon = ArrowUpDown;
              if (isActive && sortOrder === "asc") {
                SortIcon = ArrowUp;
              } else if (isActive) {
                SortIcon = ArrowDown;
              }

              return (
                <Button
                  aria-pressed={isActive}
                  className="h-8 shrink-0 gap-1.5 px-3 text-xs"
                  key={option.field}
                  onClick={() => toggleSort(option.field)}
                  size="sm"
                  type="button"
                  variant={isActive ? "secondary" : "outline"}
                >
                  {option.label}
                  <SortIcon className="size-3 opacity-60" />
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleModels.map((model) => {
          const Icon = model.icon;
          let categoryVariant: "default" | "secondary" | "outline" = "outline";
          if (model.category.includes("flagship")) {
            categoryVariant = "default";
          } else if (model.category.includes("balanced")) {
            categoryVariant = "secondary";
          }

          return (
            <Card className="transition-shadow hover:shadow-md" key={model.id}>
              <CardHeader className="pb-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Icon className="h-5 w-5 shrink-0" />
                    <div className="min-w-0">
                      <CardTitle className="font-semibold text-base">
                        {model.name}
                      </CardTitle>
                      <p className="mt-0.5 text-muted-foreground text-xs">
                        {model.provider}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className="shrink-0 font-medium text-[10px]"
                    variant={categoryVariant}
                  >
                    {model.category}
                  </Badge>
                </div>

                <div className="space-y-1.5 border-border border-t pt-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Context</span>
                    <span className="font-medium font-mono tabular-nums">
                      {(model.contextWindow / 1000).toFixed(0)}K
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Input</span>
                    <span className="font-medium font-mono tabular-nums">
                      ${model.pricing.input}/1M
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Output</span>
                    <span className="font-medium font-mono tabular-nums">
                      ${model.pricing.output}/1M
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                <div className="space-y-2.5">
                  <h4 className="font-semibold text-xs">Performance</h4>
                  {Object.entries(model.performance).map(([key, value]) => (
                    <div className="space-y-1" key={key}>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground capitalize">
                          {key}
                        </span>
                        <span className="font-mono tabular-nums">{value}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-foreground transition-all duration-300"
                          style={{ width: `${value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-xs">Capabilities</h4>
                  <ul className="space-y-1">
                    {model.capabilities.map((capability) => (
                      <li
                        className="flex items-start gap-1.5 text-xs"
                        key={capability}
                      >
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {capability}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border-border border-t pt-3 text-[10px] text-muted-foreground">
                  {new Date(model.releaseDate).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {remainingCount > 0 ? (
        <div className="mt-6 flex justify-center">
          <Button
            className="min-w-40"
            onClick={showMore}
            type="button"
            variant="outline"
          >
            Show {Math.min(PAGE_SIZE, remainingCount)} more
          </Button>
        </div>
      ) : null}

      {filteredAndSortedModels.length === 0 && (
        <div className="py-16 text-center text-muted-foreground text-sm">
          No models match your filters
        </div>
      )}
    </div>
  );
}

const GeminiIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    preserveAspectRatio="xMidYMid"
    viewBox="0 0 256 258"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <defs>
      <radialGradient
        cx="78.302%"
        cy="55.52%"
        fx="78.302%"
        fy="55.52%"
        gradientTransform="scale(.99947 1) rotate(78.858 .783 .555)"
        id="gemini-gradient-primary"
        r="78.115%"
      >
        <stop offset="0%" stopColor="#1BA1E3" />
        <stop offset=".01%" stopColor="#1BA1E3" />
        <stop offset="30.022%" stopColor="#5489D6" />
        <stop offset="54.552%" stopColor="#9B72CB" />
        <stop offset="82.537%" stopColor="#D96570" />
        <stop offset="100%" stopColor="#F49C46" />
      </radialGradient>
      <radialGradient
        cx="-3.409%"
        cy="-54.219%"
        fx="-3.409%"
        fy="-54.219%"
        gradientTransform="scale(.99946 1) rotate(78.858 -.034 -.542)"
        id="gemini-gradient-secondary"
        r="169.363%"
      >
        <stop offset="0%" stopColor="#1BA1E3" />
        <stop offset=".01%" stopColor="#1BA1E3" />
        <stop offset="30.022%" stopColor="#5489D6" />
        <stop offset="54.552%" stopColor="#9B72CB" />
        <stop offset="82.537%" stopColor="#D96570" />
        <stop offset="100%" stopColor="#F49C46" />
      </radialGradient>
    </defs>
    <path
      d="m122.062 172.77-10.27 23.52c-3.947 9.042-16.459 9.042-20.406 0l-10.27-23.52c-9.14-20.933-25.59-37.595-46.108-46.703L6.74 113.52c-8.987-3.99-8.987-17.064 0-21.053l27.385-12.156C55.172 70.97 71.917 53.69 80.9 32.043L91.303 6.977c3.86-9.303 16.712-9.303 20.573 0l10.403 25.066c8.983 21.646 25.728 38.926 46.775 48.268l27.384 12.156c8.987 3.99 8.987 17.063 0 21.053l-28.267 12.547c-20.52 9.108-36.97 25.77-46.109 46.703Z"
      fill="url(#gemini-gradient-primary)"
    />
    <path
      d="m217.5 246.937-2.888 6.62c-2.114 4.845-8.824 4.845-10.937 0l-2.889-6.62c-5.148-11.803-14.42-21.2-25.992-26.34l-8.898-3.954c-4.811-2.137-4.811-9.131 0-11.269l8.4-3.733c11.87-5.273 21.308-15.017 26.368-27.22l2.966-7.154c2.067-4.985 8.96-4.985 11.027 0l2.966 7.153c5.06 12.204 14.499 21.948 26.368 27.221l8.4 3.733c4.812 2.138 4.812 9.132 0 11.27l-8.898 3.953c-11.571 5.14-20.844 14.537-25.992 26.34Z"
      fill="url(#gemini-gradient-secondary)"
    />
  </svg>
);

const OpenAIIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    preserveAspectRatio="xMidYMid"
    viewBox="0 0 256 260"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z" />
  </svg>
);

const ClaudeAIIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    preserveAspectRatio="xMidYMid"
    viewBox="0 0 256 257"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"
      fill="#D97757"
    />
  </svg>
);

const DeepSeekIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    viewBox="0 0 256 256"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect fill="#1E88E5" height="256" rx="32" width="256" />
    <path
      d="M128 64L64 128l64 64 64-64-64-64zm0 24l40 40-40 40-40-40 40-40z"
      fill="white"
    />
  </svg>
);

const XAIIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    viewBox="0 0 256 256"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect fill="#000000" height="256" width="256" />
    <path
      d="M64 64l64 64-64 64m64-128l64 64-64 64"
      fill="none"
      stroke="white"
      strokeLinecap="round"
      strokeWidth="24"
    />
  </svg>
);

const MetaIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    viewBox="0 0 256 256"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <defs>
      <linearGradient id="meta-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stopColor="#0081FB" />
        <stop offset="100%" stopColor="#0064E0" />
      </linearGradient>
    </defs>
    <path
      d="M128 0C57.3 0 0 57.3 0 128s57.3 128 128 128 128-57.3 128-128S198.7 0 128 0zm35.5 178.5c-9.6 0-18.9-4.8-27.5-14.2-8.6 9.4-17.9 14.2-27.5 14.2-19.1 0-35.5-21.4-35.5-46.5 0-16.9 7.6-32.1 19.2-38.2 6.4-3.4 13.5-5.1 20.8-5.1 13.5 0 26.2 7.6 35.5 21.4 9.3-13.8 22-21.4 35.5-21.4 7.3 0 14.4 1.7 20.8 5.1 11.6 6.1 19.2 21.3 19.2 38.2 0 25.1-16.4 46.5-35.5 46.5z"
      fill="url(#meta-gradient)"
    />
  </svg>
);

const MistralIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    viewBox="0 0 256 256"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect fill="#FF7000" height="64" width="64" x="0" y="0" />
    <rect fill="#FF7000" height="64" width="64" x="0" y="128" />
    <rect fill="#FF7000" height="64" width="64" x="128" y="0" />
    <rect fill="#FF7000" height="64" width="64" x="128" y="128" />
    <rect fill="#FF7000" height="64" width="64" x="192" y="192" />
  </svg>
);

const PerplexityIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    viewBox="0 0 256 256"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect fill="#20808D" height="256" rx="32" width="256" />
    <path
      d="M128 48v160M48 128h160M88 88l80 80M168 88l-80 80"
      stroke="white"
      strokeLinecap="round"
      strokeWidth="16"
    />
  </svg>
);

const AmazonIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    viewBox="0 0 256 256"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M160 180c-20 15-49 23-74 23-35 0-67-13-91-35-2-2 0-4 2-3 28 16 63 26 99 26 24 0 51-5 75-15 4-2 7 2 3 5zm8-9c-3-3-18-2-25-1-2 0-2-2 0-3 17-12 44-9 47-4 3 4-1 32-17 45-2 2-4 1-3-1 3-7 9-23 6-27z"
      fill="#FF9900"
    />
    <path
      d="M145 110v-8c0-1 1-2 2-2h32c1 0 2 1 2 2v7c0 1-1 2-2 3l-17 24c6 0 13 1 19 4 1 1 2 2 2 3v8c0 1-1 2-2 2-8-4-19-5-28-1-1 0-2-1-2-2v-8c0-1 0-3 1-4l19-28h-17c-1 0-2-1-2-2zm-50 30h-10c-1 0-2-1-2-2V92c0-1 1-2 2-2h9c1 0 2 1 2 2v6h0c3-6 8-9 15-9 7 0 12 3 15 9 3-6 9-9 16-9 5 0 10 2 13 6 4 4 3 10 3 15v37c0 1-1 2-2 2h-10c-1 0-2-1-2-2v-31c0-2 0-7-1-9 0-3-2-4-5-4-2 0-4 1-5 3-1 2-1 6-1 9v32c0 1-1 2-2 2h-10c-1 0-2-1-2-2v-31c0-7-1-11-5-11-5 0-5 5-5 11v31c0 1-1 2-2 2z"
      fill="#232F3E"
    />
  </svg>
);

const ZhipuIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    viewBox="0 0 256 256"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect fill="#4A90E2" height="256" rx="32" width="256" />
    <path d="M64 96h128v16H64zm0 32h128v16H64zm0 32h96v16H64z" fill="white" />
  </svg>
);

const AlibabaIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    viewBox="0 0 256 256"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect fill="#FF6A00" height="256" width="256" />
    <path
      d="M128 48c-44.2 0-80 35.8-80 80s35.8 80 80 80 80-35.8 80-80-35.8-80-80-80zm0 136c-30.9 0-56-25.1-56-56s25.1-56 56-56 56 25.1 56 56-25.1 56-56 56z"
      fill="white"
    />
  </svg>
);

const MoonshotIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    height="1em"
    viewBox="0 0 256 256"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <defs>
      <linearGradient
        id="moonshot-gradient"
        x1="0%"
        x2="100%"
        y1="0%"
        y2="100%"
      >
        <stop offset="0%" stopColor="#667EEA" />
        <stop offset="100%" stopColor="#764BA2" />
      </linearGradient>
    </defs>
    <rect fill="url(#moonshot-gradient)" height="256" rx="32" width="256" />
    <path d="M128 64l32 64h-64l32-64zm0 128l-32-64h64l-32 64z" fill="white" />
  </svg>
);

type AIModel = {
  id: string;
  name: string;
  provider: string;
  category:
    | "flagship"
    | "balanced"
    | "fast"
    | "balanced / default"
    | "fast / cost-efficient"
    | "deep-reasoning / heavy tasks"
    | "balanced reasoning"
    | "fast reasoning nano"
    | "pro / high-end reasoning"
    | "flagship / reasoning"
    | "balanced / general"
    | "fast / low-cost"
    | "reasoning"
    | "embedding"
    | "code-specialized"
    | "image-generation"
    | "open-source";
  contextWindow: number;
  pricing: {
    input: number;
    output: number;
    cached?: number;
    batch?: number;
  };
  capabilities: string[];
  performance: {
    reasoning: number;
    speed: number;
    accuracy: number;
    creativity: number;
  };
  releaseDate: string;
  icon: React.ComponentType<{ className?: string }>;
};

const models: AIModel[] = [
  // OpenAI / GPT-5.4+ family
  {
    id: "gpt-5.5",
    name: "GPT 5.5",
    provider: "OpenAI",
    category: "balanced / default",
    contextWindow: 1_000_000,
    pricing: { input: 5, output: 30, cached: 0.5 },
    capabilities: [
      "Reasoning",
      "File input",
      "Tool use",
      "Vision",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 98, speed: 75, accuracy: 97, creativity: 95 },
    releaseDate: "2026-04",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-5.5-pro",
    name: "GPT 5.5 Pro",
    provider: "OpenAI",
    category: "flagship / reasoning",
    contextWindow: 1_000_000,
    pricing: { input: 30, output: 180 },
    capabilities: [
      "Reasoning",
      "Tool use",
      "Implicit caching",
      "File input",
      "Web search",
      "Vision",
    ],
    performance: { reasoning: 98, speed: 62, accuracy: 97, creativity: 95 },
    releaseDate: "2026-04",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-5.4",
    name: "GPT 5.4",
    provider: "OpenAI",
    category: "balanced / default",
    contextWindow: 1_050_000,
    pricing: { input: 2.5, output: 15, cached: 0.25 },
    capabilities: [
      "Reasoning",
      "Tool use",
      "Vision",
      "File input",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 97, speed: 78, accuracy: 96, creativity: 94 },
    releaseDate: "2026-03",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT 5.4 Mini",
    provider: "OpenAI",
    category: "fast / cost-efficient",
    contextWindow: 400_000,
    pricing: { input: 0.75, output: 4.5, cached: 0.075 },
    capabilities: [
      "Reasoning",
      "Tool use",
      "Vision",
      "File input",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2026-03",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT 5.4 Nano",
    provider: "OpenAI",
    category: "fast / cost-efficient",
    contextWindow: 400_000,
    pricing: { input: 0.2, output: 1.25, cached: 0.02 },
    capabilities: [
      "Reasoning",
      "Tool use",
      "Implicit caching",
      "Vision",
      "File input",
      "Web search",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2026-03",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-5.4-pro",
    name: "GPT 5.4 Pro",
    provider: "OpenAI",
    category: "flagship / reasoning",
    contextWindow: 1_050_000,
    pricing: { input: 30, output: 180 },
    capabilities: [
      "Reasoning",
      "Tool use",
      "Vision",
      "File input",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 98, speed: 62, accuracy: 97, creativity: 95 },
    releaseDate: "2026-03",
    icon: OpenAIIcon,
  },

  // OpenAI / GPT-5 family
  {
    id: "gpt-5",
    name: "GPT-5",
    provider: "OpenAI",
    category: "balanced / general",
    contextWindow: 400_000,
    pricing: { input: 1.25, output: 10, cached: 0.13 },
    capabilities: [
      "File input",
      "Reasoning",
      "Tool use",
      "Vision",
      "Image generation",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2025-08",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 mini",
    provider: "OpenAI",
    category: "fast / cost-efficient",
    contextWindow: 400_000,
    pricing: { input: 0.25, output: 2, cached: 0.025 },
    capabilities: [
      "File input",
      "Reasoning",
      "Tool use",
      "Vision",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2025-08",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-5-nano",
    name: "GPT-5 nano",
    provider: "OpenAI",
    category: "fast / cost-efficient",
    contextWindow: 400_000,
    pricing: { input: 0.05, output: 0.4, cached: 0.005 },
    capabilities: [
      "File input",
      "Reasoning",
      "Tool use",
      "Vision",
      "Image generation",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2025-08",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-5-codex",
    name: "GPT-5-Codex",
    provider: "OpenAI",
    category: "code-specialized",
    contextWindow: 400_000,
    pricing: { input: 1.25, output: 10, cached: 0.13 },
    capabilities: [
      "File input",
      "Reasoning",
      "Tool use",
      "Vision",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 93, speed: 88, accuracy: 94, creativity: 86 },
    releaseDate: "2025-09",
    icon: OpenAIIcon,
  },

  // OpenAI / GPT-4 & reasoning
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "OpenAI",
    category: "balanced / general",
    contextWindow: 1_047_576,
    pricing: { input: 2, output: 8, cached: 0.5 },
    capabilities: [
      "File input",
      "Tool use",
      "Vision",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2025-04",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 mini",
    provider: "OpenAI",
    category: "fast / cost-efficient",
    contextWindow: 1_047_576,
    pricing: { input: 0.4, output: 1.6, cached: 0.1 },
    capabilities: [
      "File input",
      "Tool use",
      "Vision",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2025-05",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-4.1-nano",
    name: "GPT-4.1 nano",
    provider: "OpenAI",
    category: "fast / cost-efficient",
    contextWindow: 1_047_576,
    pricing: { input: 0.1, output: 0.4, cached: 0.025 },
    capabilities: [
      "File input",
      "Tool use",
      "Vision",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2025-04",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    category: "balanced / general",
    contextWindow: 128_000,
    pricing: { input: 2.5, output: 10, cached: 1.25 },
    capabilities: [
      "File input",
      "Tool use",
      "Vision",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2024-05",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "OpenAI",
    category: "fast / cost-efficient",
    contextWindow: 128_000,
    pricing: { input: 0.15, output: 0.6, cached: 0.075 },
    capabilities: [
      "File input",
      "Tool use",
      "Vision",
      "Implicit caching",
      "Web search",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2024-07",
    icon: OpenAIIcon,
  },
  {
    id: "o3",
    name: "o3",
    provider: "OpenAI",
    category: "pro / high-end reasoning",
    contextWindow: 200_000,
    pricing: { input: 2, output: 8, cached: 0.5 },
    capabilities: [
      "File input",
      "Reasoning",
      "Tool use",
      "Vision",
      "Implicit caching",
    ],
    performance: { reasoning: 98, speed: 62, accuracy: 97, creativity: 95 },
    releaseDate: "2025-04",
    icon: OpenAIIcon,
  },

  // OpenAI / OSS & embeddings
  {
    id: "gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "OpenAI",
    category: "open-source",
    contextWindow: 131_072,
    pricing: { input: 0.35, output: 0.75, cached: 0.25 },
    capabilities: ["Reasoning", "Tool use", "Implicit caching"],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2025-08",
    icon: OpenAIIcon,
  },
  {
    id: "gpt-oss-20b",
    name: "GPT OSS 20B",
    provider: "OpenAI",
    category: "open-source",
    contextWindow: 131_072,
    pricing: { input: 0.05, output: 0.2 },
    capabilities: ["Reasoning", "Tool use"],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2025-08",
    icon: OpenAIIcon,
  },
  {
    id: "text-embedding-3-small",
    name: "Text Embedding 3 Small",
    provider: "OpenAI",
    category: "embedding",
    contextWindow: 8192,
    pricing: { input: 0.02, output: 0 },
    capabilities: ["Text embeddings", "Semantic search", "Clustering"],
    performance: { reasoning: 0, speed: 96, accuracy: 92, creativity: 0 },
    releaseDate: "2024-01",
    icon: OpenAIIcon,
  },
  {
    id: "text-embedding-3-large",
    name: "Text Embedding 3 Large",
    provider: "OpenAI",
    category: "embedding",
    contextWindow: 8192,
    pricing: { input: 0.13, output: 0 },
    capabilities: ["High-quality embeddings", "Semantic search", "RAG"],
    performance: { reasoning: 0, speed: 96, accuracy: 92, creativity: 0 },
    releaseDate: "2024-01",
    icon: OpenAIIcon,
  },

  // Anthropic Claude
  {
    id: "claude-opus-4.8",
    name: "Claude Opus 4.8",
    provider: "Anthropic",
    category: "flagship / reasoning",
    contextWindow: 1_000_000,
    pricing: { input: 5, output: 25, cached: 0.5 },
    capabilities: [
      "Tool use",
      "Reasoning",
      "Vision",
      "File input",
      "Explicit caching",
      "Web search",
    ],
    performance: { reasoning: 98, speed: 62, accuracy: 97, creativity: 95 },
    releaseDate: "2026-05",
    icon: ClaudeAIIcon,
  },
  {
    id: "claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    category: "balanced / general",
    contextWindow: 1_000_000,
    pricing: { input: 3, output: 15, cached: 0.3 },
    capabilities: [
      "File input",
      "Reasoning",
      "Tool use",
      "Vision",
      "Explicit caching",
      "Web search",
    ],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2026-02",
    icon: ClaudeAIIcon,
  },
  {
    id: "claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
    category: "balanced / general",
    contextWindow: 1_000_000,
    pricing: { input: 3, output: 15, cached: 0.3 },
    capabilities: [
      "File input",
      "Reasoning",
      "Tool use",
      "Vision",
      "Explicit caching",
      "Web search",
    ],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2025-09",
    icon: ClaudeAIIcon,
  },
  {
    id: "claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    category: "fast / cost-efficient",
    contextWindow: 200_000,
    pricing: { input: 1, output: 5, cached: 0.1 },
    capabilities: [
      "File input",
      "Reasoning",
      "Tool use",
      "Vision",
      "Explicit caching",
      "Web search",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2025-10",
    icon: ClaudeAIIcon,
  },

  // Google Gemini 3.x
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "Google",
    category: "flagship / reasoning",
    contextWindow: 1_000_000,
    pricing: { input: 2, output: 12, cached: 0.2 },
    capabilities: [
      "File input",
      "Tool use",
      "Reasoning",
      "Vision",
      "Web search",
      "Implicit caching",
    ],
    performance: { reasoning: 97, speed: 72, accuracy: 96, creativity: 94 },
    releaseDate: "2025-11",
    icon: GeminiIcon,
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "Google",
    category: "balanced / general",
    contextWindow: 1_000_000,
    pricing: { input: 1.5, output: 9, cached: 0.15 },
    capabilities: [
      "Reasoning",
      "File input",
      "Vision",
      "Tool use",
      "Web search",
      "Implicit caching",
    ],
    performance: { reasoning: 93, speed: 88, accuracy: 93, creativity: 91 },
    releaseDate: "2026-05",
    icon: GeminiIcon,
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "Google",
    category: "fast / cost-efficient",
    contextWindow: 1_000_000,
    pricing: { input: 0.5, output: 3, cached: 0.05 },
    capabilities: [
      "Reasoning",
      "File input",
      "Vision",
      "Tool use",
      "Web search",
      "Implicit caching",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2025-12",
    icon: GeminiIcon,
  },

  // Google Gemini 2.5
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google",
    category: "flagship / reasoning",
    contextWindow: 1_048_576,
    pricing: { input: 1.25, output: 10, cached: 0.13 },
    capabilities: [
      "File input",
      "Reasoning",
      "Tool use",
      "Vision",
      "Web search",
      "Implicit caching",
    ],
    performance: { reasoning: 95, speed: 76, accuracy: 95, creativity: 93 },
    releaseDate: "2025-03",
    icon: GeminiIcon,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    category: "fast / cost-efficient",
    contextWindow: 1_000_000,
    pricing: { input: 0.3, output: 2.5, cached: 0.03 },
    capabilities: [
      "File input",
      "Reasoning",
      "Tool use",
      "Vision",
      "Web search",
      "Implicit caching",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2025-03",
    icon: GeminiIcon,
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "Google",
    category: "fast / cost-efficient",
    contextWindow: 1_048_576,
    pricing: { input: 0.1, output: 0.4, cached: 0.01 },
    capabilities: [
      "File input",
      "Reasoning",
      "Tool use",
      "Vision",
      "Web search",
      "Implicit caching",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2025-06",
    icon: GeminiIcon,
  },
  {
    id: "gemini-embedding-001",
    name: "Gemini Embedding 001",
    provider: "Google",
    category: "embedding",
    contextWindow: 8192,
    pricing: { input: 0.15, output: 0 },
    capabilities: ["Text embeddings", "Semantic search", "Document retrieval"],
    performance: { reasoning: 0, speed: 96, accuracy: 92, creativity: 0 },
    releaseDate: "2025-05",
    icon: GeminiIcon,
  },

  // xAI Grok
  {
    id: "grok-4.3",
    name: "Grok 4.3",
    provider: "xAI",
    category: "flagship / reasoning",
    contextWindow: 1_000_000,
    pricing: { input: 1.25, output: 2.5, cached: 0.2 },
    capabilities: [
      "Reasoning",
      "Tool use",
      "Implicit caching",
      "File input",
      "Vision",
      "Web search",
    ],
    performance: { reasoning: 96, speed: 78, accuracy: 95, creativity: 94 },
    releaseDate: "2026-04",
    icon: XAIIcon,
  },
  {
    id: "grok-4.20-reasoning",
    name: "Grok 4.20 Reasoning",
    provider: "xAI",
    category: "deep-reasoning / heavy tasks",
    contextWindow: 2_000_000,
    pricing: { input: 1.25, output: 2.5, cached: 0.2 },
    capabilities: [
      "Reasoning",
      "Tool use",
      "Implicit caching",
      "Vision",
      "File input",
      "Web search",
    ],
    performance: { reasoning: 96, speed: 68, accuracy: 95, creativity: 92 },
    releaseDate: "2026-03",
    icon: XAIIcon,
  },
  {
    id: "grok-4.1-fast-reasoning",
    name: "Grok 4.1 Fast Reasoning",
    provider: "xAI",
    category: "fast / cost-efficient",
    contextWindow: 1_000_000,
    pricing: { input: 0.2, output: 0.5, cached: 0.05 },
    capabilities: [
      "Reasoning",
      "File input",
      "Vision",
      "Tool use",
      "Implicit caching",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2025-07",
    icon: XAIIcon,
  },
  {
    id: "grok-build-0.1",
    name: "Grok Build 0.1",
    provider: "xAI",
    category: "code-specialized",
    contextWindow: 256_000,
    pricing: { input: 1, output: 2, cached: 0.2 },
    capabilities: [
      "Reasoning",
      "Implicit caching",
      "Vision",
      "Tool use",
      "Web search",
    ],
    performance: { reasoning: 93, speed: 88, accuracy: 94, creativity: 86 },
    releaseDate: "2026-05",
    icon: XAIIcon,
  },

  // DeepSeek
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    category: "flagship / reasoning",
    contextWindow: 1_000_000,
    pricing: { input: 0.44, output: 0.87, cached: 0.004 },
    capabilities: [
      "Reasoning",
      "Tool use",
      "Implicit caching",
      "File input",
      "Vision",
    ],
    performance: { reasoning: 98, speed: 62, accuracy: 97, creativity: 95 },
    releaseDate: "2026-04",
    icon: DeepSeekIcon,
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    category: "balanced / general",
    contextWindow: 1_000_000,
    pricing: { input: 0.14, output: 0.28, cached: 0.003 },
    capabilities: [
      "Reasoning",
      "Tool use",
      "File input",
      "Vision",
      "Implicit caching",
    ],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2026-04",
    icon: DeepSeekIcon,
  },
  {
    id: "deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "DeepSeek",
    category: "balanced / general",
    contextWindow: 128_000,
    pricing: { input: 0.28, output: 0.42, cached: 0.028 },
    capabilities: [
      "Tool use",
      "Implicit caching",
      "Reasoning",
      "File input",
      "Vision",
    ],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2025-12",
    icon: DeepSeekIcon,
  },

  // Meta Llama
  {
    id: "llama-4-maverick",
    name: "Llama 4 Maverick 17B Instruct",
    provider: "Meta",
    category: "open-source",
    contextWindow: 128_000,
    pricing: { input: 0.24, output: 0.97 },
    capabilities: ["Tool use", "Vision"],
    performance: { reasoning: 88, speed: 86, accuracy: 89, creativity: 87 },
    releaseDate: "2025-04",
    icon: MetaIcon,
  },

  // Mistral
  {
    id: "codestral",
    name: "Mistral Codestral",
    provider: "Mistral",
    category: "code-specialized",
    contextWindow: 128_000,
    pricing: { input: 0.3, output: 0.9 },
    capabilities: ["Code generation", "Tool use", "80+ languages"],
    performance: { reasoning: 93, speed: 88, accuracy: 94, creativity: 86 },
    releaseDate: "2024-05",
    icon: MistralIcon,
  },
  {
    id: "mistral-large-3",
    name: "Mistral Large 3",
    provider: "Mistral",
    category: "flagship / reasoning",
    contextWindow: 256_000,
    pricing: { input: 0.5, output: 1.5 },
    capabilities: ["Vision", "Multimodal", "Extended context"],
    performance: { reasoning: 98, speed: 62, accuracy: 97, creativity: 95 },
    releaseDate: "2025-12",
    icon: MistralIcon,
  },

  // Perplexity
  {
    id: "sonar",
    name: "Sonar",
    provider: "Perplexity",
    category: "balanced / general",
    contextWindow: 127_000,
    pricing: { input: 1, output: 1 },
    capabilities: [
      "Web search",
      "Citations",
      "Real-time data",
      "Tool use",
      "Vision",
    ],
    performance: { reasoning: 86, speed: 93, accuracy: 88, creativity: 85 },
    releaseDate: "2025-02",
    icon: PerplexityIcon,
  },
  {
    id: "sonar-pro",
    name: "Sonar Pro",
    provider: "Perplexity",
    category: "flagship / reasoning",
    contextWindow: 200_000,
    pricing: { input: 3, output: 15 },
    capabilities: [
      "Advanced search",
      "Deep research",
      "Citations",
      "Tool use",
      "Vision",
    ],
    performance: { reasoning: 98, speed: 62, accuracy: 97, creativity: 95 },
    releaseDate: "2025-02",
    icon: PerplexityIcon,
  },
  {
    id: "sonar-reasoning-pro",
    name: "Sonar Reasoning Pro",
    provider: "Perplexity",
    category: "reasoning",
    contextWindow: 127_000,
    pricing: { input: 2, output: 8 },
    capabilities: ["Deep reasoning", "Research", "Citations", "Analysis"],
    performance: { reasoning: 98, speed: 62, accuracy: 97, creativity: 95 },
    releaseDate: "2025-02",
    icon: PerplexityIcon,
  },

  // Amazon
  {
    id: "nova-pro",
    name: "Nova Pro",
    provider: "Amazon",
    category: "balanced / general",
    contextWindow: 300_000,
    pricing: { input: 0.8, output: 3.2 },
    capabilities: ["Text & vision", "AWS integration", "Extended context"],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2024-12",
    icon: AmazonIcon,
  },

  // Zhipu AI
  {
    id: "glm-5",
    name: "GLM 5",
    provider: "Zhipu AI",
    category: "balanced / general",
    contextWindow: 202_800,
    pricing: { input: 1, output: 3.2, cached: 0.2 },
    capabilities: ["Reasoning", "Tool use", "Implicit caching"],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2026-02",
    icon: ZhipuIcon,
  },

  // Alibaba
  {
    id: "qwen3-coder-plus",
    name: "Qwen3 Coder Plus",
    provider: "Alibaba",
    category: "code-specialized",
    contextWindow: 1_000_000,
    pricing: { input: 1, output: 5, cached: 0.2 },
    capabilities: ["Code generation", "Tool use", "Agentic coding"],
    performance: { reasoning: 93, speed: 88, accuracy: 94, creativity: 86 },
    releaseDate: "2025-07",
    icon: AlibabaIcon,
  },

  // Moonshot AI
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    provider: "Moonshot AI",
    category: "balanced / general",
    contextWindow: 262_000,
    pricing: { input: 0.95, output: 4, cached: 0.16 },
    capabilities: [
      "Reasoning",
      "Tool use",
      "Vision",
      "File input",
      "Implicit caching",
    ],
    performance: { reasoning: 92, speed: 82, accuracy: 92, creativity: 90 },
    releaseDate: "2026-04",
    icon: MoonshotIcon,
  },
];

type SortField = "name" | "contextWindow" | "pricing" | "reasoning" | "speed";
type SortOrder = "asc" | "desc";

export { models, type AIModel, type SortField, type SortOrder };
