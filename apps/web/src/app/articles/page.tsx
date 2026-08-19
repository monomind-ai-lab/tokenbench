import type { Metadata } from "next";

import { ArticlesIndexPage } from "@/components/articles-index-page";

export const metadata: Metadata = { title: "AI Model and Cost Articles", description: "Six substantive guides plus clearly labeled prototype insights about AI models, routing, usage evidence, API access, and cost control.", alternates: { canonical: "/articles/" } };

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ channel?: string | string[] }> }) {
  const query = await searchParams;
  const raw = Array.isArray(query.channel) ? query.channel[0] : query.channel;
  const channel = raw === "guides" || raw === "insights" || raw === "news" ? raw : "all";
  return <ArticlesIndexPage initialChannel={channel} />;
}
