import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";
import { isValidTimezone, nextShockAt } from "../src/push-schedule.js";

test("validates IANA timezones", () => {
  assert.equal(isValidTimezone("America/New_York"), true);
  assert.equal(isValidTimezone("not/a-zone"), false);
  assert.equal(isValidTimezone(""), false);
});

test("schedules the next shock inside the next available local window", () => {
  const after = DateTime.fromISO("2026-07-20T07:00:00", { zone: "America/New_York" }).toUTC().toJSDate();
  const next = DateTime.fromJSDate(nextShockAt(after, "America/New_York", () => 0), { zone: "utc" })
    .setZone("America/New_York");

  assert.equal(next.toFormat("yyyy-MM-dd HH:mm"), "2026-07-20 08:00");
});

test("moves to the next day after the evening window", () => {
  const after = DateTime.fromISO("2026-07-20T21:00:00", { zone: "America/New_York" }).toUTC().toJSDate();
  const next = DateTime.fromJSDate(nextShockAt(after, "America/New_York", () => 0.5), { zone: "utc" })
    .setZone("America/New_York");

  assert.equal(next.toFormat("yyyy-MM-dd HH:mm"), "2026-07-21 09:30");
});

test("does not schedule a second shock in the same window", () => {
  const after = DateTime.fromISO("2026-07-20T08:30:00", { zone: "America/New_York" }).toUTC().toJSDate();
  const next = DateTime.fromJSDate(nextShockAt(after, "America/New_York", () => 0), { zone: "utc" })
    .setZone("America/New_York");

  assert.equal(next.toFormat("yyyy-MM-dd HH:mm"), "2026-07-20 12:00");
});
