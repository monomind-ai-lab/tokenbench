"use client";

import {
  Check,
  ChevronDown,
  Languages,
  Menu,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeMode = "dark" | "light";
type MenuName = "models" | "leaderboards" | "articles" | null;

type LanguageOption = {
  code: string;
  label: string;
};

const PREFERRED_LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "ko", label: "Korean" },
  { code: "zh-TW", label: "Traditional Chinese" },
  { code: "zh-CN", label: "Simplified Chinese" },
  { code: "vi", label: "Vietnamese" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "ru", label: "Russian" },
  { code: "th", label: "Thai" },
  { code: "id", label: "Indonesian" },
];

const MORE_LANGUAGES: LanguageOption[] = [
  { code: "af", label: "Afrikaans" },
  { code: "sq", label: "Albanian" },
  { code: "am", label: "Amharic" },
  { code: "ar", label: "Arabic" },
  { code: "hy", label: "Armenian" },
  { code: "az", label: "Azerbaijani" },
  { code: "eu", label: "Basque" },
  { code: "bn", label: "Bangla" },
  { code: "be", label: "Belarusian" },
  { code: "bs", label: "Bosnian" },
  { code: "bg", label: "Bulgarian" },
  { code: "my", label: "Burmese" },
  { code: "ca", label: "Catalan" },
  { code: "ceb", label: "Cebuano" },
  { code: "hr", label: "Croatian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "eo", label: "Esperanto" },
  { code: "et", label: "Estonian" },
  { code: "tl", label: "Filipino" },
  { code: "fi", label: "Finnish" },
  { code: "gl", label: "Galician" },
  { code: "ka", label: "Georgian" },
  { code: "el", label: "Greek" },
  { code: "gu", label: "Gujarati" },
  { code: "ht", label: "Haitian Creole" },
  { code: "iw", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "hu", label: "Hungarian" },
  { code: "is", label: "Icelandic" },
  { code: "ga", label: "Irish" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "jw", label: "Javanese" },
  { code: "kn", label: "Kannada" },
  { code: "kk", label: "Kazakh" },
  { code: "km", label: "Khmer" },
  { code: "lo", label: "Lao" },
  { code: "la", label: "Latin" },
  { code: "lv", label: "Latvian" },
  { code: "lt", label: "Lithuanian" },
  { code: "mk", label: "Macedonian" },
  { code: "ms", label: "Malay" },
  { code: "ml", label: "Malayalam" },
  { code: "mt", label: "Maltese" },
  { code: "mr", label: "Marathi" },
  { code: "mn", label: "Mongolian" },
  { code: "ne", label: "Nepali" },
  { code: "no", label: "Norwegian" },
  { code: "fa", label: "Persian" },
  { code: "pl", label: "Polish" },
  { code: "pa", label: "Punjabi" },
  { code: "ro", label: "Romanian" },
  { code: "sr", label: "Serbian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "sw", label: "Swahili" },
  { code: "sv", label: "Swedish" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "ur", label: "Urdu" },
  { code: "cy", label: "Welsh" },
  { code: "zu", label: "Zulu" },
];

const TOP_MODELS = [
  ["claude-mythos-5", "Claude Mythos 5", "Anthropic", "82.9"],
  ["claude-opus-5", "Claude Opus 5", "Anthropic", "82.8"],
  ["claude-fable", "Claude Fable 5", "Anthropic", "82.6"],
  ["gpt-5-6-sol", "GPT-5.6 Sol", "OpenAI", "81.8"],
  ["kimi-3", "Kimi K3", "Moonshot AI", "80.2"],
  ["qwen3-8-max", "Qwen3.8 Max", "Alibaba", "79.6"],
  ["claude-opus-4-8", "Claude Opus 4.8", "Anthropic", "76.8"],
  ["muse-spark-1-1", "Muse Spark 1.1", "Meta", "76.6"],
  ["grok-4-5", "Grok 4.5", "xAI", "75.1"],
  ["gemini-3-6-flash", "Gemini 3.6 Flash", "Google", "75.3"],
] as const;

const SIMPLE_NAV = [
  ["/", "Home"],
  ["/compare/", "Compare"],
  ["/subscribe-vs-api/", "Subscribe vs API"],
] as const;

function readLanguageCookie() {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.split("; ").find((item) => item.startsWith("googtrans="));
  return match?.split("=")[1]?.split("/").at(-1) || "en";
}

function NavigationMenu({ name, close }: { name: Exclude<MenuName, null>; close: () => void }) {
  if (name === "models") {
    return (
      <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]" role="region" aria-label="Models">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Explore models</p>
          <div className="mt-4 grid gap-2">
            {[
              ["/models/", "Models workbench", "Price, performance and catalog filters"],
              ["/models/#catalog", "Model catalog", "Search, filter and compare model evidence"],
              ["/model-lifecycle/", "Lifecycle radar", "Retirements, sunset dates and migration paths"],
            ].map(([href, title, copy]) => (
              <Link className="rounded-xl border border-transparent px-3 py-2 transition-colors hover:border-primary/25 hover:bg-accent" href={href} key={href} onClick={close}>
                <span className="block text-sm font-medium">{title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{copy}</span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Top models</p>
            <span className="text-[10px] text-muted-foreground">Live weekly rank · 12 Aug 2026</span>
          </div>
          <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {TOP_MODELS.map(([slug, model, provider, score], index) => (
              <Link className="flex items-center gap-3 bg-card px-3 py-2.5 transition-colors hover:bg-accent" href={`/model-profile?model=${slug}`} key={slug} onClick={close}>
                <span className="w-6 font-mono text-[10px] text-muted-foreground">#{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{model}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{provider}</span>
                </span>
                <span className="font-mono text-[10px]">{score}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (name === "leaderboards") {
    return (
      <div role="region" aria-label="Leaderboards">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Leaderboards · rank and re-rank models</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ["/popular-models/", "Popular models", "Browse top models by quality, performance, and cost."],
            ["/make-it-yours/", "Make it yours", "Adjust six capability weights and SLA thresholds."],
            ["/leaderboards/", "All leaderboards", "Open every evidence-backed ranking surface."],
          ].map(([href, title, copy]) => (
            <Link className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent" href={href} key={href} onClick={close}>
              <span className="text-sm font-medium">{title}</span>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">{copy}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div role="region" aria-label="Articles">
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Articles · everything about AI models</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["/articles/", "All"],
          ["/articles/?channel=guides", "Guides"],
          ["/articles/?channel=insights", "Insights"],
          ["/articles/?channel=news", "News"],
        ].map(([href, label]) => (
          <Link className="rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:bg-accent" href={href} key={href} onClick={close}>{label}</Link>
        ))}
      </div>
    </div>
  );
}

function LanguageDialog({ language, onClose, onLanguage }: { language: string; onClose: () => void; onLanguage: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filter = (items: LanguageOption[]) => normalizedQuery
    ? items.filter((item) => `${item.label} ${item.code}`.toLocaleLowerCase().includes(normalizedQuery))
    : items;
  const preferred = filter(PREFERRED_LANGUAGES);
  const more = filter(MORE_LANGUAGES);

  useEffect(() => searchRef.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section aria-label="Choose language" aria-modal="true" className="ml-auto flex max-h-[min(760px,calc(100vh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl sm:max-h-[min(760px,calc(100vh-3rem))]" role="dialog">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Language</h2>
            <p className="mt-1 text-xs text-muted-foreground">Translate this page</p>
          </div>
          <Button aria-label="Close language selector" className="size-11" onClick={onClose} size="icon-sm" variant="ghost"><X /></Button>
        </div>
        <label className="m-4 flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5" htmlFor="language-search">
          <Search className="size-4 text-muted-foreground" />
          <span className="sr-only">Search languages</span>
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" id="language-search" onChange={(event) => setQuery(event.target.value)} placeholder="Search languages" ref={searchRef} type="search" value={query} />
        </label>
        <div className="overflow-y-auto px-4 pb-5">
          {preferred.length ? <LanguageList active={language} items={preferred} label="Preferred languages" onLanguage={onLanguage} /> : null}
          {more.length ? <div className="mt-6"><LanguageList active={language} items={more} label="More languages supported by Google Translate" onLanguage={onLanguage} /></div> : null}
          {!preferred.length && !more.length ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No languages match “{query}”.</p> : null}
        </div>
      </section>
    </div>
  );
}

function LanguageList({ active, items, label, onLanguage }: { active: string; items: LanguageOption[]; label: string; onLanguage: (code: string) => void }) {
  return (
    <div>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</p>
      <div aria-label={label} className="grid grid-cols-2 gap-1" role="menu">
        {items.map((item) => (
          <button aria-checked={active === item.code} className={cn("flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-accent", active === item.code && "bg-active-control text-active-control-foreground")} key={item.code} onClick={() => onLanguage(item.code)} role="menuitemradio" type="button">
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{item.code === "en" ? "" : item.code}</span>
            {active === item.code ? <Check className="size-3" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function MarketingForm() {
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const valid = String(data.get("firstName") || "").trim()
      && String(data.get("company") || "").trim()
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.get("email") || "").trim());
    setStatus(valid ? "success" : "error");
  };

  return (
    <section aria-label="LLM API Cost and Benchmark Cheatsheet" className="rounded-2xl border border-border bg-card p-5 md:col-span-2 lg:col-span-1">
      <h2 className="text-sm font-semibold">LLM API Cost &amp; Benchmark Cheatsheet</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Get monthly model costs, context windows, and category rankings in one downloadable PDF or CSV.</p>
      <form className="mt-5 grid gap-3" noValidate onSubmit={submit}>
        <label className="grid gap-1 text-xs">First name<input className="min-h-11 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" maxLength={120} name="firstName" required /></label>
        <label className="grid gap-1 text-xs">Company<input className="min-h-11 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" maxLength={120} name="company" required /></label>
        <label className="grid gap-1 text-xs">Email<input className="min-h-11 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" name="email" required type="email" /></label>
        <label className="flex min-h-11 items-start gap-2 text-xs leading-5 text-muted-foreground"><input className="mt-1" name="consent" type="checkbox" />Notify me when new models are added to TokenBench.</label>
        <Button className="mt-1 min-h-11 rounded-full" type="submit">Preview signup</Button>
        {status === "error" ? <p role="alert" className="text-xs text-destructive">Enter a valid first name, company, and email address.</p> : null}
        {status === "success" ? <p role="status" className="text-xs text-emerald-500">Preview captured. No production request was sent.</p> : null}
      </form>
    </section>
  );
}

function SiteHeader({ theme, onLanguage, onTheme }: { theme: ThemeMode; onLanguage: () => void; onTheme: () => void }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState<MenuName>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const navButton = (name: Exclude<MenuName, null>, label: string) => (
    <button aria-expanded={menu === name} className={cn("flex min-h-11 items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground", menu === name && "bg-active-control text-active-control-foreground")} onClick={() => setMenu((current) => current === name ? null : name)} type="button">
      {label}<ChevronDown className={cn("size-3.5 transition-transform", menu === name && "rotate-180")} />
    </button>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-5 sm:px-8 lg:px-10">
        <Link aria-label="TokenBench home" className="flex min-h-11 items-center gap-2 rounded-lg" href="/">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card p-1 dark:border-white/70 dark:bg-white">
            <Image alt="" className="size-6 object-contain" height={512} preload sizes="24px" src="/brand/monomind-tokenbench.png" width={512} />
          </span>
          <span className="font-semibold tracking-tight">TokenBench</span>
        </Link>
        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 lg:flex">
          <Link className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground", pathname === "/" && "bg-active-control text-active-control-foreground")} href="/">Home</Link>
          {navButton("models", "Models")}
          {navButton("leaderboards", "Leaderboards")}
          {SIMPLE_NAV.slice(1).map(([href, label]) => <Link className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground", pathname.startsWith(href.replace(/\/$/, "")) && "bg-active-control text-active-control-foreground")} href={href} key={href} onClick={() => setMenu(null)}>{label}</Link>)}
          {navButton("articles", "Articles")}
        </nav>
        <div className="ml-auto flex items-center gap-1 lg:ml-3">
          <Button aria-label="Choose language" className="size-11" onClick={onLanguage} size="icon-sm" variant="ghost"><Languages /></Button>
          <Button aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} className="size-11" onClick={onTheme} size="icon-sm" variant="ghost">{theme === "dark" ? <Sun /> : <Moon />}</Button>
          <Button aria-controls="mobile-site-navigation" aria-expanded={mobileOpen} aria-label={mobileOpen ? "Close navigation" : "Open navigation"} className="size-11 lg:hidden" onClick={() => setMobileOpen((open) => !open)} size="icon-sm" variant="ghost">{mobileOpen ? <X /> : <Menu />}</Button>
        </div>
      </div>
      {menu ? <div className="hidden border-t border-border bg-background lg:block"><div className="mx-auto max-w-7xl px-10 py-6"><NavigationMenu close={() => setMenu(null)} name={menu} /></div></div> : null}
      {mobileOpen ? (
        <nav aria-label="Mobile navigation" className="grid gap-1 border-t border-border bg-background px-4 py-4 lg:hidden" id="mobile-site-navigation">
          <Link className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground", pathname === "/" && "bg-active-control text-active-control-foreground")} href="/" onClick={() => setMobileOpen(false)}>Home</Link>
          <Link className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground", pathname.startsWith("/models") && "bg-active-control text-active-control-foreground")} href="/models/" onClick={() => setMobileOpen(false)}>Models</Link>
          <Link className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground", pathname.startsWith("/model-lifecycle") && "bg-active-control text-active-control-foreground")} href="/model-lifecycle/" onClick={() => setMobileOpen(false)}>Model lifecycle</Link>
          <Link className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground", pathname.startsWith("/leaderboards") && "bg-active-control text-active-control-foreground")} href="/leaderboards/" onClick={() => setMobileOpen(false)}>Leaderboards</Link>
          <Link className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground", pathname.startsWith("/popular-models") && "bg-active-control text-active-control-foreground")} href="/popular-models/" onClick={() => setMobileOpen(false)}>Popular models</Link>
          <Link className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground", pathname.startsWith("/make-it-yours") && "bg-active-control text-active-control-foreground")} href="/make-it-yours/" onClick={() => setMobileOpen(false)}>Make it yours</Link>
          <Link className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground", pathname.startsWith("/compare") && "bg-active-control text-active-control-foreground")} href="/compare/" onClick={() => setMobileOpen(false)}>Compare</Link>
          <Link className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground", pathname.startsWith("/subscribe-vs-api") && "bg-active-control text-active-control-foreground")} href="/subscribe-vs-api/" onClick={() => setMobileOpen(false)}>Subscribe vs API</Link>
          <Link className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground", pathname.startsWith("/articles") && "bg-active-control text-active-control-foreground")} href="/articles/" onClick={() => setMobileOpen(false)}>Articles</Link>
        </nav>
      ) : null}
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/35">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.1fr_.75fr_.65fr_1.25fr] lg:px-10">
        <section aria-label="About TokenBench">
          <Link aria-label="TokenBench home" className="inline-flex min-h-11 items-center gap-3 rounded-lg" href="/">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card p-1.5 dark:border-white/70 dark:bg-white">
              <Image alt="" className="size-7 object-contain" height={512} sizes="28px" src="/brand/monomind-tokenbench.png" width={512} />
            </span>
            <span>
              <span className="block font-semibold tracking-tight">TokenBench</span>
              <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">MonoMind AI Lab</span>
            </span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">Source-aware model, pricing, and workload evidence for practical AI decisions.</p>
          <p className="mt-3 text-xs text-muted-foreground">Verify provider evidence before purchasing.</p>
        </section>
        <nav aria-label="Explore" className="grid content-start gap-2 text-sm">
          <p className="mb-1 text-xs font-medium">Explore</p>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/models/">Models workbench</Link>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/subscribe-vs-api/">Subscribe vs API</Link>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/popular-models/">Popular models</Link>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/make-it-yours/">Make it yours</Link>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/compare/">Compare models</Link>
        </nav>
        <nav aria-label="Articles" className="grid content-start gap-2 text-sm">
          <p className="mb-1 text-xs font-medium">Articles</p>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/articles/?channel=guides">Guides</Link>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/articles/?channel=insights">Insights</Link>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/articles/?channel=news">News</Link>
        </nav>
        <MarketingForm />
      </div>
      <div className="border-t border-border px-5 py-5 text-center text-[11px] text-muted-foreground"><a className="transition-colors hover:text-link" href="https://monomind.one/">Powered by MonoMind AI Lab</a></div>
    </footer>
  );
}

export function SiteChrome({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<ThemeMode>(
    (onStoreChange) => {
      const observer = new MutationObserver(onStoreChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark") ? "dark" : "light",
    () => "dark",
  );
  const [language, setLanguage] = useState("en");
  const [languageOpen, setLanguageOpen] = useState(false);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("tbTheme", next); } catch { /* storage is optional */ }
  };

  const changeLanguage = (code: string) => {
    setLanguage(code);
    document.documentElement.lang = code;
    document.cookie = `googtrans=/en/${code}; path=/; SameSite=Lax`;
    const translateSelect = document.querySelector<HTMLSelectElement>(".goog-te-combo");
    if (translateSelect) {
      translateSelect.value = code;
      translateSelect.dispatchEvent(new Event("change"));
    }
    setLanguageOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground transition-transform focus:translate-y-0" href="#page-content">Skip to page content</a>
      <SiteHeader onLanguage={() => { setLanguage(readLanguageCookie()); setLanguageOpen(true); }} onTheme={toggleTheme} theme={theme} />
      <main id="page-content" tabIndex={-1}>{children}</main>
      <SiteFooter />
      {languageOpen ? <LanguageDialog language={language} onClose={() => setLanguageOpen(false)} onLanguage={changeLanguage} /> : null}
    </div>
  );
}

export const themeBootstrapScript = `(function(){try{var t=localStorage.getItem('tbTheme');var v=t==='light'?'light':'dark';document.documentElement.classList.toggle('dark',v==='dark');document.documentElement.dataset.theme=v;}catch(e){document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark';}})();`;
