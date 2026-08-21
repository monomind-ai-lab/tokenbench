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
import { LEADERBOARD_ROUTES } from "@tokenbench/routing/leaderboard-routes";

type ThemeMode = "dark" | "light";
type NavigationMenuName = "models" | "leaderboards" | "articles";
type MenuName = NavigationMenuName | "language" | null;

type LanguageOption = {
  code: string;
  label: string;
};

/**
 * A client-safe ranking row supplied by the server shell. The rank is the
 * accepted source rank, not a position inferred from the rendered array.
 */
export type SiteChromeTopModel = {
  readonly modelId: string;
  readonly name: string;
  readonly provider: string;
  readonly score: number | string;
  readonly rank: number;
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

const LLM_LEADERBOARD_KEYS = [
  "llm-overall",
  "llm-coding",
  "llm-agentic",
  "llm-reasoning",
  "llm-knowledge",
  "llm-human-preference",
  "llm-value",
  "llm-pricing-context",
] as const;

const MULTIMODAL_LEADERBOARD_KEYS = [
  "multimodal-vision-documents",
  "media-text-to-image",
  "media-image-editing",
  "media-text-to-video",
  "media-image-to-video",
  "media-video-editing",
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

function NavigationMenu({
  name,
  close,
  topModels,
  topModelsLabel,
}: {
  name: NavigationMenuName;
  close: () => void;
  topModels?: readonly SiteChromeTopModel[];
  topModelsLabel?: string;
}) {
  if (name === "models") {
    return (
      <div className="grid gap-6 md:grid-cols-[.8fr_1.2fr]" role="region" aria-label="Models">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Explore models</p>
            <span className="font-mono text-[10px] text-muted-foreground">Decision surfaces</span>
          </div>
          <div className="mt-3 grid divide-y divide-border">
            {[
              ["/models/", "Models workbench", "Price, performance and catalog filters"],
              ["/models/#model-catalog", "Model catalog", "Search, filter and compare model evidence"],
              ["/model-lifecycle/", "Lifecycle radar", "Retirements, sunset dates and migration paths"],
            ].map(([href, title, copy]) => (
              <Link className="rounded-lg px-1 py-3 transition-colors hover:bg-accent" href={href} key={href} onClick={close}>
                <span className="block text-sm font-medium">{title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{copy}</span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold">Top models</p>
            <span className="font-mono text-[10px] text-muted-foreground">{topModelsLabel?.trim() || "Current ranking"}</span>
          </div>
          {topModels?.length ? (
            <div className="mt-3 grid gap-x-4 sm:grid-cols-2">
              {topModels.map((model) => (
                <Link className="flex items-center gap-3 border-b border-border px-1 py-2.5 transition-colors hover:bg-accent" href={`/model-profile?model=${encodeURIComponent(model.modelId)}`} key={model.modelId} onClick={close}>
                  <span className="w-6 font-mono text-[10px] text-muted-foreground">#{model.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{model.name}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{model.provider}</span>
                  </span>
                  <span className="font-mono text-[10px]">{model.score}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-xs leading-5 text-muted-foreground" role="status">Top-model ranking is unavailable.</p>
          )}
        </div>
      </div>
    );
  }

  if (name === "leaderboards") {
    return (
      <div role="region" aria-label="Leaderboards">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Leaderboards · rank and re-rank models</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[.9fr_1fr_1fr]">
          <div>
            <p className="text-sm font-semibold">Ranking workbenches</p>
            <div className="mt-3 grid divide-y divide-border">
              {[
                ["/popular-models/", "Popular models", "Browse top models by quality, performance, and cost."],
                ["/make-it-yours/", "Make it yours", "Adjust capability weights and evidence thresholds."],
                ["/leaderboards/", "All leaderboards", "Open every evidence-backed ranking surface."],
              ].map(([href, title, copy]) => (
                <Link className="rounded-lg px-1 py-3 transition-colors hover:bg-accent" href={href} key={href} onClick={close}>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{copy}</span>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">Language-model leaderboards</p>
            <div className="mt-3 grid divide-y divide-border">
              {LLM_LEADERBOARD_KEYS.map((key) => {
                const route = LEADERBOARD_ROUTES[key];
                return (
                  <Link className="flex min-h-11 items-center rounded-lg px-1 py-2 text-xs font-medium transition-colors hover:bg-accent" href={route.pathname} key={key} onClick={close}>
                    {route.navigationLabel}
                  </Link>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">Multimodal and media</p>
            <div className="mt-3 grid divide-y divide-border">
              {MULTIMODAL_LEADERBOARD_KEYS.map((key) => {
                const route = LEADERBOARD_ROUTES[key];
                return (
                  <Link className="flex min-h-11 items-center rounded-lg px-1 py-2 text-xs font-medium transition-colors hover:bg-accent" href={route.pathname} key={key} onClick={close}>
                    {route.navigationLabel}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div role="region" aria-label="Articles">
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Articles · everything about AI models</p>
      <div className="mt-4 grid gap-2">
        {[
          ["/articles/", "All", "Browse every published guide and clearly labeled prototype."],
          ["/articles/?channel=guides", "Guides", "Practical workflows for model, access, usage, and cost decisions."],
          ["/articles/?channel=insights", "Insights", "Explore clearly labeled prototype research directions."],
          ["/articles/?channel=news", "News", "Check the publication slot for verified product and data updates."],
        ].map(([href, label, copy]) => (
          <Link className="grid min-h-14 grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent" href={href} key={href} onClick={close}>
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs leading-5 text-muted-foreground">{copy}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LanguageMenu({ language, onClose, onLanguage }: { language: string; onClose: () => void; onLanguage: (code: string) => void }) {
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
    <section aria-label="Choose language" className="absolute right-0 top-full z-[60] mt-2 flex max-h-[min(34rem,calc(100vh-5.5rem))] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-soft" id="site-menu-language" role="dialog">
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
    <section aria-label="LLM API Cost and Benchmark Cheatsheet" className="footer-marketing-form rounded-2xl p-5 md:col-span-2 lg:col-span-1">
      <h2 className="text-sm font-semibold">LLM API Cost &amp; Benchmark Cheatsheet</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Get monthly model costs, context windows, and category rankings in one downloadable PDF or CSV.</p>
      <form className="mt-5 grid gap-3" noValidate onSubmit={submit}>
        <label className="grid gap-1 text-xs font-medium">First name<input className="footer-marketing-input min-h-11 rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" maxLength={120} name="firstName" required /></label>
        <label className="grid gap-1 text-xs font-medium">Company<input className="footer-marketing-input min-h-11 rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" maxLength={120} name="company" required /></label>
        <label className="grid gap-1 text-xs font-medium">Email<input className="footer-marketing-input min-h-11 rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" name="email" required type="email" /></label>
        <label className="flex min-h-11 items-start gap-2 text-xs leading-5 text-muted-foreground"><input className="mt-1 size-4 shrink-0 accent-primary" name="consent" type="checkbox" />Notify me when new models are added to TokenBench.</label>
        <Button className="mt-1 min-h-11 rounded-lg" type="submit">Join the waitlist</Button>
        {status === "error" ? <p role="alert" className="text-xs text-destructive">Enter a valid first name, company, and email address.</p> : null}
        {status === "success" ? <p role="status" className="text-xs text-emerald-500">Thanks — your details are ready for the marketing list.</p> : null}
      </form>
    </section>
  );
}

function BrandLockup() {
  return (
    <>
      <Image alt="" className="block size-7 shrink-0 bg-transparent object-contain" height={512} sizes="28px" src="/brand/monomind-tokenbench.png" width={512} />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-none tracking-[-0.025em]">TokenBench</span>
      </span>
    </>
  );
}

function SiteHeader({ language, theme, onLanguage, onLanguageOpen, onTheme, topModels, topModelsLabel }: { language: string; theme: ThemeMode; onLanguage: (code: string) => void; onLanguageOpen: () => void; onTheme: () => void; topModels?: readonly SiteChromeTopModel[]; topModelsLabel?: string }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState<MenuName>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const closeMenu = () => setMenu(null);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenu(null);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

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

  const toggleMenu = (name: MenuName) => () => {
    if (name === "language" && menu !== "language") onLanguageOpen();
    setMenu((current) => current === name ? null : name);
  };
  const panelWidth = (name: NavigationMenuName) => name === "models"
    ? topModels?.length ? "w-[min(56rem,calc(100vw-2rem))]" : "w-[min(42rem,calc(100vw-2rem))]"
    : name === "leaderboards"
      ? "w-[min(56rem,calc(100vw-2rem))]"
      : "w-[min(38rem,calc(100vw-2rem))]";
  const panelPosition = (name: NavigationMenuName) => {
    if (name === "models" && topModels?.length) return "left-1/2 -translate-x-1/2 xl:left-[-15.5rem] xl:translate-x-0";
    if (name === "leaderboards") return "left-1/2 -translate-x-1/2 xl:left-[-20rem] xl:translate-x-0";
    return "left-1/2 -translate-x-1/2";
  };
  const navButton = (name: NavigationMenuName, label: string) => (
    <div className="relative">
      <button aria-controls={`site-menu-${name}`} aria-expanded={menu === name} className={cn("flex min-h-11 items-center gap-1 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground", menu === name && "bg-active-control text-active-control-foreground")} onClick={toggleMenu(name)} type="button">
        {label}<ChevronDown className={cn("size-3.5 transition-transform", menu === name && "rotate-180")} />
      </button>
      {menu === name ? <div className={cn("absolute top-full z-[60] mt-2 max-h-[calc(100vh-5.5rem)] overflow-y-auto rounded-xl border border-border bg-popover p-4 shadow-soft", panelWidth(name), panelPosition(name))} id={`site-menu-${name}`}><NavigationMenu close={closeMenu} name={name} topModels={topModels} topModelsLabel={topModelsLabel} /></div> : null}
    </div>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl" ref={headerRef}>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-5 sm:px-8 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-10">
        <Link aria-label="TokenBench home" className="flex min-h-11 items-center gap-2 rounded-lg bg-transparent lg:justify-self-start" href="/">
          <BrandLockup />
        </Link>
        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 lg:ml-0 lg:flex lg:justify-self-center">
          <Link className={cn("flex min-h-11 items-center rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground", pathname === "/" && "bg-active-control text-active-control-foreground")} href="/">Home</Link>
          {navButton("models", "Models")}
          {navButton("leaderboards", "Leaderboards")}
          {SIMPLE_NAV.slice(1).map(([href, label]) => <Link className={cn("flex min-h-11 items-center rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground", pathname.startsWith(href.replace(/\/$/, "")) && "bg-active-control text-active-control-foreground")} href={href} key={href} onClick={closeMenu}>{label}</Link>)}
          {navButton("articles", "Articles")}
        </nav>
        <div className="ml-auto flex items-center gap-1 lg:ml-0 lg:justify-self-end">
          <div className="relative">
            <Button aria-controls="site-menu-language" aria-expanded={menu === "language"} aria-label="Choose language" className={cn("size-11", menu === "language" && "bg-active-control text-active-control-foreground")} onClick={toggleMenu("language")} size="icon-sm" variant="ghost"><Languages /></Button>
            {menu === "language" ? <LanguageMenu language={language} onClose={closeMenu} onLanguage={(code) => { onLanguage(code); closeMenu(); }} /> : null}
          </div>
          <Button aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} className="size-11" onClick={onTheme} size="icon-sm" variant="ghost">{theme === "dark" ? <Sun /> : <Moon />}</Button>
          <Button aria-controls="mobile-site-navigation" aria-expanded={mobileOpen} aria-label={mobileOpen ? "Close navigation" : "Open navigation"} className="size-11 lg:hidden" onClick={() => { closeMenu(); setMobileOpen((open) => !open); }} size="icon-sm" variant="ghost">{mobileOpen ? <X /> : <Menu />}</Button>
        </div>
      </div>
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
          <Link aria-label="TokenBench home" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-transparent" href="/">
            <BrandLockup />
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">Source-aware model, pricing, and workload evidence for practical AI decisions.</p>
          <p className="mt-3 text-xs font-medium text-brand-secondary">Verify provider evidence before purchasing.</p>
        </section>
        <nav aria-label="Explore" className="grid content-start gap-2 text-sm">
          <p className="mb-1 text-xs font-medium">Explore</p>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/models/">Models workbench</Link>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/subscribe-vs-api/">Subscribe vs API</Link>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/popular-models/">Popular models</Link>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/make-it-yours/">Make it yours</Link>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/compare/">Compare models</Link>
          <Link className="text-muted-foreground transition-colors hover:text-link" href="/data-sources/">Data sources</Link>
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

export function SiteChrome({ children, topModels, topModelsLabel }: { children: ReactNode; topModels?: readonly SiteChromeTopModel[]; topModelsLabel?: string }) {
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
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground transition-transform focus:translate-y-0" href="#page-content">Skip to page content</a>
      <SiteHeader language={language} onLanguage={changeLanguage} onLanguageOpen={() => setLanguage(readLanguageCookie())} onTheme={toggleTheme} theme={theme} topModels={topModels} topModelsLabel={topModelsLabel} />
      <main id="page-content" tabIndex={-1}>{children}</main>
      <SiteFooter />
    </div>
  );
}

export const themeBootstrapScript = `(function(){try{var t=localStorage.getItem('tbTheme');var v=t==='light'?'light':'dark';document.documentElement.classList.toggle('dark',v==='dark');document.documentElement.dataset.theme=v;}catch(e){document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark';}})();`;
