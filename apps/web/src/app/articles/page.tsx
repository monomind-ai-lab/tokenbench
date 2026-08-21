import type { Metadata } from "next";

import { ArticlesIndexPage } from "@/components/articles-index-page";

export const metadata: Metadata = { title: "AI Model and Cost Articles", description: "Six substantive guides plus clearly labeled prototype insights about AI models, routing, usage evidence, API access, and cost control.", alternates: { canonical: "/articles/" } };

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ channel?: string | string[]; search?: string | string[]; sort?: string | string[]; topic?: string | string[] }> }) {
  const query = await searchParams;
  const raw = Array.isArray(query.channel) ? query.channel[0] : query.channel;
  const channel = raw === "guides" || raw === "insights" || raw === "news" ? raw : "all";
  const rawSort = Array.isArray(query.sort) ? query.sort[0] : query.sort;
  const sort = rawSort === "oldest" || rawSort === "title" || rawSort === "shortest" ? rawSort : "newest";
  const rawTopic = Array.isArray(query.topic) ? query.topic[0] : query.topic;
  const topic = ["Routing", "Usage", "Cost", "Access", "Evidence"].includes(rawTopic ?? "") ? rawTopic! : "All topics";
  const rawSearch = Array.isArray(query.search) ? query.search[0] : query.search;
  return <ArticlesIndexPage initialChannel={channel} initialQuery={rawSearch ?? ""} initialSort={sort} initialTopic={topic} />;
}
