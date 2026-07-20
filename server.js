import { createApp } from "./src/app.js";
import { createPool, createRepository, initializeDatabase } from "./src/db.js";

const pool = createPool();
await initializeDatabase(pool);

const app = createApp(createRepository(pool), {
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || ""
});
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, "0.0.0.0", () => console.log(`Forth listening on ${port}`));

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
