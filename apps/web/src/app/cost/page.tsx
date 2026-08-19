import { redirect } from "next/navigation";

const DEFAULT_SCENARIO = "/subscribe-vs-api/?provider=openai&plan=individual&models=gpt-4o&mix=gpt-4o%3A100&conversationsPerDay=5&messagesPerConversation=8&activeDays=22&inputTokensPerMessage=1200&outputTokensPerMessage=350&cacheReadShare=20&cacheWriteShare=5&seats=1&tokenVolume=0&inputCharactersPerMessage=4800&outputCharactersPerMessage=1400&contentType=text&longContext=0";

export default function CostRedirectPage() {
  redirect(DEFAULT_SCENARIO);
}
