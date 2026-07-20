import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const SEED_QUESTIONS = [
  "What woke you today — if anything did?",
  "Where do you go when you disappear?",
  "What are you pretending not to know?",
  "Who is asking?",
  "When did you last feel your own weight?",
  "What runs you when no one is watching?",
  "What would you notice if you moved half as fast?",
  "What are you still carrying that was never yours?"
];

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const publicHandle = (handle) => handle?.trim() || "anon";
const makeToken = () => crypto.randomBytes(32).toString("base64url");

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const hostname = new URL(connectionString).hostname;
  return new Pool({
    connectionString,
    ssl: hostname === "localhost" || hostname.endsWith(".railway.internal")
      ? false
      : { rejectUnauthorized: true }
  });
}

export async function initializeDatabase(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id uuid PRIMARY KEY,
      body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
      handle text CHECK (handle IS NULL OR char_length(handle) <= 80),
      delete_token_hash char(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE TABLE IF NOT EXISTS replies (
      id uuid PRIMARY KEY,
      question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
      handle text CHECK (handle IS NULL OR char_length(handle) <= 80),
      delete_token_hash char(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS replies_question_created_idx
      ON replies (question_id, created_at);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint text PRIMARY KEY,
      p256dh text NOT NULL,
      auth text NOT NULL,
      timezone text NOT NULL,
      next_push_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS push_subscriptions_due_idx
      ON push_subscriptions (next_push_at);

    ALTER TABLE questions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
  `);

  for (const [index, body] of SEED_QUESTIONS.entries()) {
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    await pool.query(
      `INSERT INTO questions (id, body, handle, delete_token_hash)
       VALUES ($1, $2, NULL, $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, body, "0".repeat(64)]
    );
  }
}

const mapQuestion = (row) => ({
  id: row.id,
  text: row.body,
  handle: publicHandle(row.handle),
  createdAt: row.created_at
});

const mapReply = (row) => ({
  id: row.id,
  text: row.body,
  handle: publicHandle(row.handle),
  createdAt: row.created_at
});

export function createRepository(pool) {
  async function withReplies(questionRow) {
    if (!questionRow) return null;
    const replies = await pool.query(
      `SELECT id, body, handle, created_at
       FROM replies WHERE question_id = $1 ORDER BY created_at ASC`,
      [questionRow.id]
    );
    return { ...mapQuestion(questionRow), replies: replies.rows.map(mapReply) };
  }

  return {
    async health() {
      await pool.query("SELECT 1");
    },

    async randomQuestion(excludedIds = []) {
      let result = await pool.query(
        `SELECT id, body, handle, created_at FROM questions
         WHERE deleted_at IS NULL AND NOT (id = ANY($1::uuid[]))
         ORDER BY random() LIMIT 1`,
        [excludedIds]
      );
      if (!result.rowCount) {
        result = await pool.query(
          "SELECT id, body, handle, created_at FROM questions WHERE deleted_at IS NULL ORDER BY random() LIMIT 1"
        );
      }
      return withReplies(result.rows[0]);
    },

    async createQuestion({ text, handle }) {
      const id = crypto.randomUUID();
      const deleteToken = makeToken();
      const result = await pool.query(
        `INSERT INTO questions (id, body, handle, delete_token_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, body, handle, created_at`,
        [id, text, handle || null, hashToken(deleteToken)]
      );
      return { ...mapQuestion(result.rows[0]), replies: [], deleteToken };
    },

    async deleteQuestion(id, deleteToken) {
      const result = await pool.query(
        `UPDATE questions SET
           body = '[removed]', handle = NULL, delete_token_hash = $3, deleted_at = now()
         WHERE id = $1 AND delete_token_hash = $2 AND deleted_at IS NULL`,
        [id, hashToken(deleteToken), "0".repeat(64)]
      );
      return result.rowCount > 0;
    },

    async createReply(questionId, { text, handle }) {
      const id = crypto.randomUUID();
      const deleteToken = makeToken();
      const result = await pool.query(
        `INSERT INTO replies (id, question_id, body, handle, delete_token_hash)
         SELECT $1, id, $3, $4, $5 FROM questions WHERE id = $2 AND deleted_at IS NULL
         RETURNING id, body, handle, created_at`,
        [id, questionId, text, handle || null, hashToken(deleteToken)]
      );
      if (!result.rowCount) return null;
      return { ...mapReply(result.rows[0]), deleteToken };
    },

    async deleteReply(id, deleteToken) {
      const result = await pool.query(
        "DELETE FROM replies WHERE id = $1 AND delete_token_hash = $2",
        [id, hashToken(deleteToken)]
      );
      return result.rowCount > 0;
    },

    async savePushSubscription({ endpoint, keys, timezone, nextPushAt }) {
      await pool.query(
        `INSERT INTO push_subscriptions (endpoint, p256dh, auth, timezone, next_push_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE SET
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           timezone = EXCLUDED.timezone,
           updated_at = now()`,
        [endpoint, keys.p256dh, keys.auth, timezone, nextPushAt]
      );
    },

    async removePushSubscription(endpoint) {
      await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
    },

    async duePushSubscriptions(limit = 100) {
      const result = await pool.query(
        `SELECT endpoint, p256dh, auth, timezone, next_push_at
         FROM push_subscriptions
         WHERE next_push_at <= now()
         ORDER BY next_push_at ASC LIMIT $1`,
        [limit]
      );
      return result.rows.map((row) => ({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
        timezone: row.timezone,
        dueAt: row.next_push_at
      }));
    },

    async scheduleNextPush(endpoint, nextPushAt) {
      await pool.query(
        "UPDATE push_subscriptions SET next_push_at = $2, updated_at = now() WHERE endpoint = $1",
        [endpoint, nextPushAt]
      );
    }
  };
}
