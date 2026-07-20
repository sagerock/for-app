import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { validPushSubscription } from "../src/push-validation.js";

function keys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: crypto.randomBytes(16).toString("base64url")
  };
}

test("accepts browser-shaped subscriptions from known push services", () => {
  assert.equal(validPushSubscription({
    endpoint: "https://web.push.apple.com/QN/example",
    keys: keys()
  }), true);
});

test("rejects arbitrary endpoints and malformed key material", () => {
  assert.equal(validPushSubscription({
    endpoint: "https://example.com/push",
    keys: keys()
  }), false);
  assert.equal(validPushSubscription({
    endpoint: "https://fcm.googleapis.com/fcm/send/example",
    keys: { p256dh: "not-a-key", auth: "not-auth" }
  }), false);
});
