/**
 * Captures the screenshots used in the README.
 *
 * Drives a real Chrome in a throwaway profile (no extensions, no saved
 * state) so the output is the same every run and does not depend on
 * whatever is installed in your day-to-day browser.
 *
 *   node scripts/capture-screenshots.mjs
 *
 * Requires the app and judge to be running (`pnpm dev`) and Docker up.
 * Set ANTHROPIC_API_KEY in apps/web/.env first, or the AI panels will
 * screenshot as "not configured".
 */
import puppeteer from "puppeteer-core";
import fs from "fs/promises";
import os from "os";
import path from "path";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs", "screenshots");
const CHROME =
  process.env.CHROME_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const EMAIL = process.env.SCREENSHOT_EMAIL ?? "demo@algoarena.dev";
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? "arena-demo-2026";

const VIEWPORT = { width: 1512, height: 950, deviceScaleFactor: 2 };

const WRONG = "function sum(num1, num2) { return num1 * num2; }";
const RIGHT = "function sum(num1, num2) { return num1 + num2; }";

const shots = [];

/**
 * `focus` is text to scroll into view first. The editor is 60vh tall, so the
 * verdict grid and the AI panels sit below the fold on a fresh load and would
 * otherwise be cropped out of every screenshot.
 */
async function shot(page, name, note, focus) {
  if (focus) {
    await page.evaluate((needle) => {
      const target = [...document.querySelectorAll("h3, div, p")]
        .reverse()
        .find((el) => el.textContent?.includes(needle));
      target?.scrollIntoView({ block: "center", behavior: "instant" });
    }, focus);
    await new Promise((r) => setTimeout(r, 600));
  }

  await fs.mkdir(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push({ name, note });
  console.log(`  captured ${name}.png`);
}

/** Monaco owns its DOM, so set the model rather than typing into it. */
async function setEditor(page, code) {
  await page.waitForFunction(
    () => window.monaco?.editor?.getModels?.().length > 0,
    { timeout: 30_000 },
  );
  await page.evaluate((value) => {
    window.monaco.editor.getModels()[0].setValue(value);
  }, code);
  // Let React pick up the change event before anything reads the state.
  await new Promise((r) => setTimeout(r, 400));
}

async function signIn(page) {
  await page.goto(`${BASE}/api/auth/signin`, { waitUntil: "networkidle2" });
  await page.type("#input-username-for-credentials-provider", EMAIL);
  await page.type("#input-password-for-credentials-provider", PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click("button[type=submit]"),
  ]);
  console.log("signed in as", EMAIL);
}

/**
 * Resolves a problem URL by its title. Matching against the card markup was
 * fragile, so this just opens each problem and reads its heading — slower,
 * but it cannot silently pick the wrong problem.
 */
async function problemUrlByTitle(page, wanted) {
  await page.goto(`${BASE}/problems`, { waitUntil: "networkidle2" });

  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/problem/"]')].map((a) =>
      a.getAttribute("href"),
    ),
  );
  if (hrefs.length === 0) {
    throw new Error("No problems found — did you run `pnpm db:seed`?");
  }

  for (const href of hrefs) {
    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
    // Statements are markdown, so the title can be any heading level —
    // "## Two sum" renders as an h2, not an h1.
    const heading = await page.evaluate(
      () =>
        document
          .querySelector(".prose h1, .prose h2, .prose h3")
          ?.textContent?.trim() ?? "",
    );
    if (heading.toLowerCase() === wanted.toLowerCase()) {
      console.log(`  using problem "${heading}"`);
      return `${BASE}${href}`;
    }
  }

  console.warn(`  (no problem titled "${wanted}", falling back to the first)`);
  return `${BASE}${hrefs[0]}`;
}

/** Submits and waits for the verdict panel to settle. */
async function submit(page) {
  // Must be `button[type=submit]`: the "Submit" tab trigger is also a button
  // whose text is exactly "Submit", and it comes first in DOM order, so
  // matching on text alone just switched tabs and never submitted anything.
  const clicked = await page.evaluate(() => {
    const button = document.querySelector("button[type=submit]:not([disabled])");
    if (!button) return false;
    button.click();
    return true;
  });
  if (!clicked) throw new Error("Submit button not found or disabled");

  // Wait for judging to start, then finish. Without waiting for the start,
  // the "has it finished" check passes instantly on the pre-submit state.
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some((b) =>
          b.textContent?.includes("Judging..."),
        ),
      { timeout: 15_000 },
    )
    .catch(() => {});

  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].some((b) =>
        b.textContent?.includes("Judging..."),
      ),
    { timeout: 180_000 },
  );
  await new Promise((r) => setTimeout(r, 1500));

  // A submission that produced no testcase grid means the request failed —
  // fail loudly rather than screenshotting an empty panel.
  const testcases = await page.evaluate(
    () => document.body.innerText.match(/Test #\d+/g)?.length ?? 0,
  );
  if (testcases === 0) {
    const toast = await page.evaluate(
      () =>
        document.querySelector('[class*="Toastify"]')?.textContent?.trim() ??
        "(no error shown)",
    );
    throw new Error(`Submission produced no verdict. Page said: ${toast}`);
  }
  console.log(`  judged ${testcases} testcases`);
}

/** Clicks an AI button and waits for the streamed answer to stop growing. */
async function runAiPanel(page, labelFragment) {
  const clicked = await page.evaluate((fragment) => {
    const button = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(fragment),
    );
    if (!button) return false;
    button.click();
    return true;
  }, labelFragment);

  if (!clicked) {
    console.warn(`  (no button matching "${labelFragment}")`);
    return false;
  }

  let previous = -1;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const length = await page.evaluate(() => document.body.innerText.length);
    if (length === previous && i > 2) break;
    previous = length;
  }
  return true;
}

async function main() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "arena-shots-"));

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: profile,
    defaultViewport: VIEWPORT,
    args: ["--disable-extensions", "--hide-scrollbars", "--force-color-profile=srgb"],
  });

  try {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: "dark" },
    ]);

    await signIn(page);

    console.log("problems list");
    await page.goto(`${BASE}/problems`, { waitUntil: "networkidle2" });
    await shot(page, "01-problems", "Problem list with per-problem difficulty");

    const problemUrl = await problemUrlByTitle(page, "Two sum");

    console.log("problem page");
    await page.goto(problemUrl, { waitUntil: "networkidle2" });
    await setEditor(page, RIGHT);
    await shot(page, "02-problem", "Problem statement and Monaco editor");

    console.log("failing submission");
    await setEditor(page, WRONG);
    await submit(page);
    await shot(page, "03-rejected", "Per-testcase verdicts from the sandbox", "Test #1");

    console.log("  AI failure analysis");
    if (await runAiPanel(page, "Explain why it failed")) {
      await shot(page, "04-ai-explain", "AI explains the bug without fixing it", "AI Failure Analysis");
    }

    console.log("accepted submission");
    await page.goto(problemUrl, { waitUntil: "networkidle2" });
    await setEditor(page, RIGHT);
    await new Promise((r) => setTimeout(r, 11_000)); // clear the rate limiter
    await submit(page);
    await shot(page, "05-accepted", "Accepted, with per-testcase time", "Test #1");

    console.log("  AI code review");
    if (await runAiPanel(page, "Review my solution")) {
      await shot(page, "06-ai-review", "AI review of an accepted submission", "AI Code Review");
    }

    console.log("hints");
    await page.goto(problemUrl, { waitUntil: "networkidle2" });
    await setEditor(page, "function sum(num1, num2) {\n  // stuck\n}");
    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Stuck? Get a hint"))
        ?.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    if (await runAiPanel(page, "1. Nudge")) {
      await shot(page, "07-ai-hints", "Tiered hints, priced in contest points", "AI Hints");
    }

    console.log(`\n${shots.length} screenshot(s) written to docs/screenshots/`);
    for (const s of shots) console.log(`  ${s.name}.png — ${s.note}`);
  } finally {
    await browser.close();
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
