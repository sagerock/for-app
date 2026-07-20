import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { isValidTimezone, nextShockAt } from "./push-schedule.js";
import { validPushSubscription } from "./push-validation.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cleanText = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export function createApp(repository, { vapidPublicKey = "" } = {}) {
  const app = express();
  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: false,
    legacyHeaders: false,
    message: { error: "Please wait before writing again." }
  });
  const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: false,
    legacyHeaders: false,
    message: { error: "Please wait before returning to the room." }
  });
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "16kb" }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    if (req.method === "POST") return writeLimiter(req, res, next);
    next();
  });
  app.use("/api/questions/random", readLimiter);

  app.get("/health", async (req, res, next) => {
    try {
      await repository.health();
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/questions/random", async (req, res, next) => {
    try {
      const excludedIds = String(req.query.exclude || "").split(",").filter((id) => ID_PATTERN.test(id)).slice(0, 2);
      const question = await repository.randomQuestion(excludedIds);
      if (!question) return res.status(404).json({ error: "No question is available." });
      res.json({ question });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/questions", async (req, res, next) => {
    try {
      const text = cleanText(req.body?.text, 500);
      const handle = cleanText(req.body?.handle, 80);
      if (!text) return res.status(400).json({ error: "A question is required." });
      const question = await repository.createQuestion({ text, handle });
      res.status(201).json({ question });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/questions/:id", async (req, res, next) => {
    try {
      if (!ID_PATTERN.test(req.params.id)) return res.status(404).end();
      const token = req.get("x-delete-token") || "";
      if (!token || !(await repository.deleteQuestion(req.params.id, token))) return res.status(404).end();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/questions/:id/replies", async (req, res, next) => {
    try {
      if (!ID_PATTERN.test(req.params.id)) return res.status(404).end();
      const text = cleanText(req.body?.text, 2000);
      const handle = cleanText(req.body?.handle, 80);
      if (!text) return res.status(400).json({ error: "A reply is required." });
      const reply = await repository.createReply(req.params.id, { text, handle });
      if (!reply) return res.status(404).end();
      res.status(201).json({ reply });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/replies/:id", async (req, res, next) => {
    try {
      if (!ID_PATTERN.test(req.params.id)) return res.status(404).end();
      const token = req.get("x-delete-token") || "";
      if (!token || !(await repository.deleteReply(req.params.id, token))) return res.status(404).end();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/push/public-key", (req, res) => {
    res.json({ enabled: Boolean(vapidPublicKey), publicKey: vapidPublicKey });
  });

  app.post("/api/push/subscriptions", async (req, res, next) => {
    try {
      const subscription = req.body?.subscription;
      const timezone = req.body?.timezone;
      if (!vapidPublicKey) return res.status(503).json({ error: "The call is not available yet." });
      if (!validPushSubscription(subscription) || !isValidTimezone(timezone)) {
        return res.status(400).json({ error: "The subscription is not valid." });
      }
      await repository.savePushSubscription({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        timezone,
        nextPushAt: nextShockAt(new Date(), timezone)
      });
      res.status(201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/push/unsubscribe", async (req, res, next) => {
    try {
      if (req.body?.endpoint) await repository.removePushSubscription(req.body.endpoint);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/manifest.webmanifest", (req, res) => res.sendFile(path.join(ROOT, "manifest.webmanifest")));
  app.get("/service-worker.js", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(ROOT, "service-worker.js"));
  });
  app.use("/icons", express.static(path.join(ROOT, "icons"), { maxAge: "7d" }));
  app.get("/", (req, res) => res.sendFile(path.join(ROOT, "index.html")));

  app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: "Something interrupted the room. Try again." });
  });

  return app;
}
