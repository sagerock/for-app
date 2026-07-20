import crypto from "node:crypto";

const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com"
];

function validEndpoint(value) {
  try {
    if (typeof value !== "string" || value.length > 2048) return false;
    const url = new URL(value);
    return url.protocol === "https:" && (
      PUSH_HOSTS.includes(url.hostname) ||
      url.hostname.endsWith(".notify.windows.com") ||
      url.hostname.endsWith(".wns.windows.com")
    );
  } catch {
    return false;
  }
}

export function validPushSubscription(subscription) {
  try {
    const p256dh = Buffer.from(subscription?.keys?.p256dh || "", "base64url");
    const auth = Buffer.from(subscription?.keys?.auth || "", "base64url");
    if (!validEndpoint(subscription?.endpoint) || p256dh.length !== 65 || auth.length !== 16) return false;
    crypto.ECDH.convertKey(p256dh, "prime256v1");
    return true;
  } catch {
    return false;
  }
}
