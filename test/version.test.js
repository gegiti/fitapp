import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_VERSION } from "../js/version.js";

const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("the version shown in the app matches the service worker cache version", () => {
  const m = sw.match(/const VERSION = "([^"]+)"/);
  assert.ok(m, "sw.js should declare a VERSION");
  assert.equal(APP_VERSION, m[1], "bump both: the number on screen must be the one the phone is serving");
});

test("the version module is precached, so the Train page still renders offline", () => {
  assert.match(sw, /"\.\/js\/version\.js"/);
});
