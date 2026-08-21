import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { csvDownloadText, ResultActions, resultImageOptions, rowsToCsv, ViewModeToggle } from "./result-actions";

test("rowsToCsv neutralizes spreadsheet formula starters before serializing cells", () => {
  const csv = rowsToCsv([{
    safe: "plain text",
    equals: "=SUM(1,1)",
    plus: "+1+1",
    minus: "-1",
    at: "@SUM(A1:A2)",
    tab: "\t=1+1",
    spaced: " =1+1",
    quoted: "a\"b",
  }]);

  assert.equal(csv, [
    "safe,equals,plus,minus,at,tab,spaced,quoted",
    "plain text,\"'=SUM(1,1)\",'+1+1,'-1,'@SUM(A1:A2),'\t=1+1,' =1+1,\"a\"\"b\"",
  ].join("\r\n"));
});

test("csvDownloadText prepends a UTF-8 BOM without changing the CSV payload", () => {
  assert.equal(csvDownloadText([{ model: "模型" }]), "\uFEFFmodel\r\n模型");
});

test("rowsToCsv caps numeric export cells at two decimal places", () => {
  assert.equal(rowsToCsv([{ score: 98.42519685, cost: 0.01449 }]), "score,cost\r\n98.43,0.01");
});

test("resultImageOptions excludes marked export chrome from a PNG capture", () => {
  const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");

  class FakeHTMLElement {
    dataset: { exportAction?: string } = {};
  }

  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: FakeHTMLElement });
  try {
    const options = resultImageOptions("rgb(0, 0, 0)", 2);
    const action = new FakeHTMLElement();
    action.dataset.exportAction = "true";

    assert.equal(options.filter(action as unknown as Node), false);
    assert.equal(options.filter(new FakeHTMLElement() as unknown as Node), true);
  } finally {
    if (originalHTMLElement) Object.defineProperty(globalThis, "HTMLElement", originalHTMLElement);
    else Reflect.deleteProperty(globalThis, "HTMLElement");
  }
});

test("ResultActions retains its accessible action group while identifying export chrome", () => {
  const markup = renderToStaticMarkup(createElement(ResultActions, {
    filename: "tokenbench-result",
    rows: [],
    targetId: "result",
  }));

  assert.match(markup, /data-export-action="true"/);
  assert.match(markup, /aria-label="Share and export result"/);
  assert.match(markup, /role="group"/);
  assert.match(markup, /aria-live="polite"/);
});

test("ViewModeToggle gives its pressed view the semantic active-control treatment", () => {
  const markup = renderToStaticMarkup(createElement(ViewModeToggle, {
    mode: "cards",
    onChange: () => {},
  }));

  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /bg-active-control text-active-control-foreground/);
  assert.doesNotMatch(markup, /bg-muted text-foreground/);
});
