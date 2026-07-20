# Forth — self-remembering

A small-group web app rooted in Gurdjieff's Fourth Way. It interrupts automatism,
holds a brief pause, offers one question, then gets out of the way.

There are no accounts, profiles, feeds, counts, streaks, or reply notifications.
Each post carries only the handle typed for that moment. A private deletion token
stays on the device that wrote it.

Live: https://forth-app-production.up.railway.app/

## Run locally

```sh
npm install
DATABASE_URL=postgres://... npm start
```

The app and API run as one Railway service backed by Postgres. `npm run push:send`
is the short-lived cron worker that sends scheduled shock-only web pushes.
