import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute } from "../js/router.js";

test("routes", () => {
  assert.deepEqual(parseRoute("#/plan"), { name: "plan", params: {} });
  assert.deepEqual(parseRoute("#/plan/workout/w1"), { name: "workout", params: { id: "w1" } });
  assert.deepEqual(parseRoute("#/plan/bank"), { name: "bank", params: {} });
  assert.deepEqual(parseRoute("#/plan/bank/pick/w1"), { name: "bank", params: { pick: "w1" } });
  assert.deepEqual(parseRoute("#/train"), { name: "train", params: {} });
  assert.deepEqual(parseRoute("#/train/session/w1"), { name: "session", params: { id: "w1" } });
  assert.deepEqual(parseRoute("#/train/done/w1"), { name: "done", params: { id: "w1" } });
  assert.deepEqual(parseRoute(""), { name: "plan", params: {} });
  assert.deepEqual(parseRoute("#/garbage/x"), { name: "plan", params: {} });
});
