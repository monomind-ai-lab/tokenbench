import { HomePage } from "@/components/home-page";
import { loadHomeData } from "@/lib/home-data.server";
import { projectHomeData } from "@/lib/home-projector";

export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await loadHomeData();
  return <HomePage data={projectHomeData(snapshot)} />;
}
