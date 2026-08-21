"use client";

import { ArrowRight, BookOpen, FlaskConical, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prototypeInsights, publishedArticles } from "@/lib/articles";

type Channel = "all" | "guides" | "insights" | "news";

const channels: ReadonlyArray<{ value: Channel; label: string; count: number }> = [
  { value: "all", label: "All", count: publishedArticles.length + prototypeInsights.length },
  { value: "guides", label: "Guides", count: publishedArticles.length },
  { value: "insights", label: "Insights", count: prototypeInsights.length },
  { value: "news", label: "News", count: 0 },
];

const topics = ["All topics", "Routing", "Usage", "Cost", "Access", "Evidence"];

export function ArticlesIndexPage({ initialChannel }: { initialChannel: Channel }) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>(initialChannel);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All topics");
  const [sort, setSort] = useState<"newest" | "oldest" | "title">("newest");

  const entries = useMemo(
    () =>
      [...publishedArticles, ...prototypeInsights]
        .filter((entry) => channel === "all" || entry.category.toLowerCase() === channel)
        .filter((entry) => topic === "All topics" || entry.topic === topic)
        .filter((entry) =>
          `${entry.title} ${entry.dek} ${entry.topic}`.toLowerCase().includes(query.toLowerCase()),
        )
        .toSorted((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title)
            : sort === "oldest"
              ? a.date.localeCompare(b.date)
              : b.date.localeCompare(a.date),
        ),
    [channel, query, sort, topic],
  );

  const selectChannel = (next: Channel) => {
    setChannel(next);
    router.replace(next === "all" ? "/articles/" : `/articles/?channel=${next}`, { scroll: false });
  };

  return (
    <main>
      <section className="px-4 pt-6 sm:px-6 sm:pt-10" aria-labelledby="articles-heading">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-[linear-gradient(120deg,var(--brand)_0%,#1111ff_42%,#101127_100%)] px-5 py-8 text-white sm:px-10 sm:py-14 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)] lg:items-end lg:gap-12">
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl" id="articles-heading">
            Practical guidance for model, cost, and <span className="text-[#9dabff]">evidence decisions.</span>
          </h1>
          <p className="mt-8 max-w-xl border-t border-white/20 pt-5 text-pretty text-base leading-7 text-white/85 sm:text-lg lg:mt-0 lg:border-t-0 lg:border-l lg:pl-10 lg:pt-0">
            Six substantive field guides and two clearly labeled prototype insights. Empty and unpublished article records are excluded.
          </p>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto max-w-7xl">
          <nav aria-label="Article channels" className="flex flex-wrap items-end gap-1 border-b border-border">
            {channels.map(({ value, label, count }) => {
              const selected = channel === value;

              return (
                <button
                  aria-pressed={selected}
                  className={`flex min-h-11 w-[100px] items-center justify-center gap-1.5 rounded-t-[8px] rounded-b-none border border-b-0 px-2 py-[7px] text-xs font-bold leading-[14px] transition-colors ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/35 hover:bg-accent hover:text-foreground"
                  }`}
                  key={value}
                  onClick={() => selectChannel(value)}
                  type="button"
                >
                  <span>{label}</span>
                  <span className="font-mono text-[10px] tabular-nums">{count}</span>
                </button>
              );
            })}
          </nav>

          <section className="mt-8 grid gap-5 border-b border-border pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)] lg:items-end" aria-labelledby="article-filters-heading">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="article-filters-heading">
                Find the next useful answer
              </h2>
              <div aria-label="Article topics" className="mt-4 flex flex-wrap items-center gap-2" role="group">
                {topics.map((value) => {
                  const selected = topic === value;

                  return (
                    <button
                      aria-pressed={selected}
                      className={`inline-flex min-h-11 items-center justify-center rounded-[50px] border px-2.5 py-[7px] text-center text-[11px] font-bold leading-[14px] transition-colors ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/35 hover:text-foreground"
                      }`}
                      key={value}
                      onClick={() => setTopic(value)}
                      type="button"
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-end">
              <label className="relative block">
                <span className="sr-only">Search articles</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search articles"
                  className="h-11 pl-9"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search articles"
                  value={query}
                />
              </label>
              <label className="block w-full sm:w-36 sm:justify-self-end">
                <span className="sr-only">Sort articles</span>
                <select
                  className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  onChange={(event) => setSort(event.target.value as typeof sort)}
                  value={sort}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title">Title A–Z</option>
                </select>
              </label>
            </div>
          </section>

          <p aria-live="polite" className="mt-5 text-sm text-muted-foreground">
            <span className="font-mono text-foreground tabular-nums">{entries.length}</span> articles shown
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {entries.map((entry) => {
              const prototype = entry.category === "Insights";
              const href = prototype ? "#prototype-insights" : `/articles/${entry.slug}/`;

              return (
                <Card className="h-full transition-colors hover:ring-primary/35 focus-within:ring-primary/50" key={entry.slug}>
                  <CardHeader className="gap-4">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] leading-4 text-brand-secondary">
                      <span>{prototype ? "Prototype insight" : entry.date}</span>
                      <span aria-hidden="true">·</span>
                      <span>{prototype ? entry.topic : `${entry.category} · ${entry.topic}`}</span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.readTime}</span>
                    </div>
                    <CardTitle className="text-pretty text-xl tracking-[-0.02em]">
                      {prototype ? (
                        <a className="-m-2 block min-h-11 rounded-md p-2 transition-colors hover:text-primary focus-visible:text-primary" href={href}>
                          {entry.title}
                        </a>
                      ) : (
                        <Link className="-m-2 block min-h-11 rounded-md p-2 transition-colors hover:text-primary focus-visible:text-primary" href={href}>
                          {entry.title}
                        </Link>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="min-h-20 text-sm leading-6 text-muted-foreground">{entry.dek}</p>
                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      {prototype ? <FlaskConical className="size-4 shrink-0 text-primary" /> : <BookOpen className="size-4 shrink-0 text-primary" />}
                      <span>{prototype ? "Prototype disclosure" : "Published field guide"}</span>
                    </div>
                  </CardContent>
                  <CardFooter className="mt-auto justify-between bg-muted/40">
                    <span className="font-mono text-[10px] text-muted-foreground">{prototype ? "Concept only" : entry.topic}</span>
                    {prototype ? (
                      <a className="group/cta inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand-secondary hover:underline" href={href}>
                        Review disclosure <ArrowRight className="size-3.5 transition-transform group-hover/cta:translate-x-0.5" />
                      </a>
                    ) : (
                      <Link className="group/cta inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand-secondary hover:underline" href={href}>
                        Read field guide <ArrowRight className="size-3.5 transition-transform group-hover/cta:translate-x-0.5" />
                      </Link>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {entries.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-border p-12 text-center">
              <h2 className="font-medium">No published entries match</h2>
              <p className="mt-2 text-sm text-muted-foreground">Try another channel, topic, or search phrase.</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="px-4 pb-12 sm:px-6 sm:pb-16" id="prototype-insights">
        <div className="mx-auto max-w-7xl border-t border-border pt-6">
          <div className="rounded-xl border border-border bg-muted/35 px-5 py-5 sm:flex sm:items-start sm:justify-between sm:gap-8 sm:px-6">
            <div className="max-w-3xl">
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]">
                <FlaskConical className="size-4 text-primary" />
                Prototype insights remain clearly labeled concepts.
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The two insight entries demonstrate future research directions. They remain intentionally linked to this disclosure and do not fabricate substantive article routes or evidence.
              </p>
            </div>
            <span className="mt-4 inline-flex font-mono text-[10px] uppercase tracking-[0.12em] text-primary sm:mt-1 sm:shrink-0">2 concepts</span>
          </div>
        </div>
      </section>
    </main>
  );
}
