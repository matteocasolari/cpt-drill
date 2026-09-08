import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home presents Progress as a chart utility in the header", async () => {
  const source = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(source, /class="home-header"/);
  assert.match(source, /class="progress-shortcut"/);
  assert.match(source, /class="progress-shortcut-icon"/);
  assert.doesNotMatch(source, /<button data-action="progress">View progress<\/button>/);
});
