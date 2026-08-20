import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { SiteChrome, themeBootstrapScript } from "@/components/site-chrome";
import { loadSiteChromeData } from "@/lib/site-chrome-data.server";

import "./globals.css";

const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });
const jetBrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://tokenbench.monomind.one"),
  title: {
    default: "TokenBench — Empirical AI runtime and cost evidence",
    template: "%s · TokenBench",
  },
  description: "Independent, source-aware model, pricing, benchmark, and workload evidence for practical AI decisions.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const chromeData = await loadSiteChromeData();
  return (
    <html className={`dark ${interTight.variable} ${jetBrainsMono.variable}`} data-theme="dark" lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} /></head>
      <body className="font-sans antialiased">
        <SiteChrome
          topModels={chromeData.topModels}
          topModelsLabel={chromeData.topModelsLabel}
        >
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}
