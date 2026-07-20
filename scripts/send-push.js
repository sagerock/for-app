import webpush from "web-push";
import { createPool, createRepository } from "../src/db.js";
import { nextShockAt } from "../src/push-schedule.js";
import { validPushSubscription } from "../src/push-validation.js";

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT = "mailto:sage@sagerock.com" } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error("VAPID keys are required");

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const pool = createPool();
const repository = createRepository(pool);
const subscriptions = await repository.duePushSubscriptions();

for (const subscription of subscriptions) {
  if (!validPushSubscription(subscription)) {
    await repository.removePushSubscription(subscription.endpoint);
    continue;
  }
  try {
    const payload = JSON.stringify({
      title: "Forth",
      body: "I am",
      url: "/",
      tag: `forth-shock-${new Date(subscription.dueAt).getTime()}`
    });
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      payload,
      { TTL: 900, urgency: "normal", timeout: 10000 }
    );
    await repository.scheduleNextPush(
      subscription.endpoint,
      nextShockAt(new Date(), subscription.timezone)
    );
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await repository.removePushSubscription(subscription.endpoint);
    } else {
      console.error(`Push failed (${error.statusCode || "unknown"}): ${error.message}`);
      await repository.scheduleNextPush(subscription.endpoint, new Date(Date.now() + 30 * 60 * 1000));
    }
  }
}

console.log(`Processed ${subscriptions.length} due shock subscription(s).`);
await pool.end();
