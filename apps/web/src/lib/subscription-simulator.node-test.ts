import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeMix,
  parseSubscriptionScenario,
  serializeSubscriptionScenario,
} from "./subscription-simulator";

test("subscription URL state has no fallback plan or model fixture", () => {
  const scenario = parseSubscriptionScenario(new URLSearchParams("provider=microsoft"));

  assert.equal(scenario.provider, "microsoft");
  assert.equal(scenario.plan, "");
  assert.deepEqual(scenario.models, []);
  assert.deepEqual(scenario.mix, {});
  assert.deepEqual(normalizeMix([], null), {});
  assert.match(serializeSubscriptionScenario(scenario), /provider=microsoft/);
  assert.match(serializeSubscriptionScenario(scenario), /plan=/);
});
