import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL || "http://localhost:3000";
const executablePath = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];

async function openQuestion(viewport, screenshotPath) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout;
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Math.min(delay, 60), ...args);
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByText("question", { exact: true }).waitFor();
  await page.getByText("question", { exact: true }).click();
  await page.getByText("read more", { exact: true }).waitFor();
  await page.getByText("read more", { exact: true }).click();
  await page.getByText("The Study Room", { exact: true }).waitFor();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  assert.equal(await page.getByText("no replies yet").count(), 0);
  assert.equal(await page.getByText(/\d+ repl/i).count(), 0);
  await page.getByText("Reply", { exact: true }).click();
  await page.locator("#respondHandle").waitFor();
  assert.match(await page.locator("#respondHandle").getAttribute("placeholder"), /anon/);
  await context.close();
}

try {
  const firstContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const firstPage = await firstContext.newPage();
  await firstPage.goto(baseUrl);
  await firstPage.getByText("I am", { exact: true }).waitFor();
  await firstPage.waitForTimeout(4800);
  await firstPage.screenshot({ path: "/tmp/forth-shock-mobile.png" });
  await firstContext.close();

  await openQuestion({ width: 390, height: 844 }, "/tmp/forth-study-mobile.png");
  await openQuestion({ width: 1280, height: 900 }, "/tmp/forth-study-desktop.png");
  assert.deepEqual(errors, []);
  console.log(`Browser smoke passed against ${baseUrl}`);
} finally {
  await browser.close();
}
