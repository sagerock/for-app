import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";

const QUESTION_ID = "00000000-0000-4000-8000-000000000001";
const REPLY_ID = "00000000-0000-4000-8000-000000000002";

async function withApp(repository, run, options = {}) {
  const server = createApp(repository, options).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function repository(overrides = {}) {
  return {
    health: async () => {},
    randomQuestion: async () => ({ id: QUESTION_ID, text: "Who is asking?", handle: "anon", replies: [] }),
    createQuestion: async ({ text, handle }) => ({ id: QUESTION_ID, text, handle: handle || "anon", replies: [], deleteToken: "secret" }),
    deleteQuestion: async (id, token) => id === QUESTION_ID && token === "secret",
    createReply: async (questionId, { text, handle }) => questionId === QUESTION_ID
      ? { id: REPLY_ID, text, handle: handle || "anon", deleteToken: "reply-secret" }
      : null,
    deleteReply: async (id, token) => id === REPLY_ID && token === "reply-secret",
    savePushSubscription: async () => {},
    removePushSubscription: async () => {},
    ...overrides
  };
}

test("creates a question with a momentary handle and delete token", async () => {
  await withApp(repository(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/questions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "  What remains?  ", handle: "  Jamie  " })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.question.text, "What remains?");
    assert.equal(body.question.handle, "Jamie");
    assert.equal(body.question.deleteToken, "secret");
  });
});

test("requires the unguessable token to delete words", async () => {
  await withApp(repository(), async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/questions/${QUESTION_ID}`, { method: "DELETE" });
    const deleted = await fetch(`${baseUrl}/api/questions/${QUESTION_ID}`, {
      method: "DELETE",
      headers: { "x-delete-token": "secret" }
    });

    assert.equal(denied.status, 404);
    assert.equal(deleted.status, 204);
  });
});

test("does not expose a feed or reply counts", async () => {
  await withApp(repository(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/questions/random`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.question.text, "Who is asking?");
    assert.equal("replyCount" in body.question, false);
  });
});

test("rejects invalid push subscription timezones", async () => {
  await withApp(repository(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/push/subscriptions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        timezone: "somewhere",
        subscription: { endpoint: "https://push.example/1", keys: { p256dh: "a", auth: "b" } }
      })
    });

    assert.equal(response.status, 400);
  }, { vapidPublicKey: "public" });
});
