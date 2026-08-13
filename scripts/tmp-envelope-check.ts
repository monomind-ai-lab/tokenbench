import { readFileSync } from 'node:fs';
import { LEADERBOARD_DEFINITIONS, type LeaderboardEntry } from '../src/benchmarks/leaderboards';
import { blendedCostPerMillion, isPrimaryHostedRoute } from '../src/benchmarks/value';

const payload = JSON.parse(readFileSync('/tmp/tbdebug/lv.json', 'utf8'));
const entries: LeaderboardEntry[] = payload.data.entries;
const definition = LEADERBOARD_DEFINITIONS['llm-value'];
const profile = 'balanced' as const;

function near(a: number, b: number) { return Math.abs(a - b) < 1e-9; }

let priceFail = 0, costFail = 0, ctxFail = 0, rankFail = 0;
for (const e of entries) {
  const p = e.primaryPrice!;
  if (!isPrimaryHostedRoute(p, e.model.sourceId)) priceFail++;
  const expected = blendedCostPerMillion(p.inputUsdPerMillion!, p.outputUsdPerMillion!, profile);
  if (!near(e.blendedCostPerMillion!, expected)) {
    if (costFail === 0) console.log('cost mismatch sample:', e.model.name, e.blendedCostPerMillion, 'expected', expected);
    costFail++;
  }
  const validCtx = Number.isSafeInteger(p.contextWindowTokens) && (p.contextWindowTokens ?? 0) > 0 ? p.contextWindowTokens : null;
  if (e.contextWindowTokens !== validCtx) {
    if (ctxFail === 0) console.log('ctx mismatch sample:', e.model.name, e.contextWindowTokens, 'vs price ctx', p.contextWindowTokens);
    ctxFail++;
  }
  if (e.sourceRank !== e.metric!.rank) rankFail++;
}
console.log({ total: entries.length, priceFail, costFail, ctxFail, rankFail, kind: definition.kind });
