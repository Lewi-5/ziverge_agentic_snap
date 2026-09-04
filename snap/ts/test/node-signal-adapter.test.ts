import test from "node:test";
import assert from "node:assert/strict";
import { createNodeSignalAdapter } from "../src/adapters/node-signal-adapter.js";

test("NodeSignalAdapter registers and cleans up signal listeners idempotently", () => {
  const adapter = createNodeSignalAdapter();
  const listener = (): void => {
    // test listener
  };

  const beforeCountInt = process.listenerCount("SIGINT");
  const beforeCountTerm = process.listenerCount("SIGTERM");

  const unsubscribe = adapter.onSignal(["SIGINT", "SIGTERM"], listener);

  assert.equal(process.listenerCount("SIGINT"), beforeCountInt + 1);
  assert.equal(process.listenerCount("SIGTERM"), beforeCountTerm + 1);

  // First cleanup
  unsubscribe();
  assert.equal(process.listenerCount("SIGINT"), beforeCountInt);
  assert.equal(process.listenerCount("SIGTERM"), beforeCountTerm);

  // Idempotent second cleanup
  unsubscribe();
  assert.equal(process.listenerCount("SIGINT"), beforeCountInt);
  assert.equal(process.listenerCount("SIGTERM"), beforeCountTerm);
});
