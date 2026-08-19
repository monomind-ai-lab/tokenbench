import { notFound, redirect } from "next/navigation";

import { guideIndexArticles } from "@/lib/articles";

export default async function GuideRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!guideIndexArticles.some((article) => article.slug === slug)) notFound();
  redirect(`/articles/${slug}/`);
}
