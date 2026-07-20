import { DateTime } from "luxon";

const WINDOWS = [[8, 11], [12, 16], [17, 20]];

export function isValidTimezone(timezone) {
  return Boolean(timezone) && DateTime.now().setZone(timezone).isValid;
}

export function nextShockAt(after = new Date(), timezone = "UTC", random = Math.random) {
  const now = DateTime.fromJSDate(after, { zone: "utc" }).setZone(timezone);

  for (let dayOffset = 0; dayOffset < 2; dayOffset += 1) {
    const day = now.plus({ days: dayOffset }).startOf("day");
    for (const [startHour, endHour] of WINDOWS) {
      if (dayOffset === 0 && now >= day.plus({ hours: startHour })) continue;
      const windowMinutes = (endHour - startHour) * 60;
      const minute = Math.floor(random() * windowMinutes);
      const candidate = day.plus({ hours: startHour, minutes: minute });
      if (candidate > now.plus({ minutes: 5 })) return candidate.toUTC().toJSDate();
    }
  }

  return now.plus({ days: 1 }).startOf("day").plus({ hours: 8 }).toUTC().toJSDate();
}
