/**
 * 真实浏览器宽度检查（Chrome headless + DevTools Protocol）
 * 用途：D5「移动端 375px 无横向滚动」的可复跑证据。
 * 运行：node scripts/ui-mobile-check.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const BASE = "http://localhost:3000";
const OUT = path.resolve("../../autoeval/ui-round10");
const PAGES = [
  "/",
  "/chat",
  "/tasks",
  "/deadlines",
  "/processes",
  "/contacts",
  "/notices",
  "/calendar",
  "/resources",
  "/research",
  "/innovation",
  "/about",
  "/test",
  "/login",
  "/policies",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForChrome() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome devtools not ready");
}

function connect(url) {
  const ws = new WebSocket(url);
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return {
    ready,
    send(method, params = {}) {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => ws.close(),
  };
}

const PROBE = `(() => {
  const iw = window.innerWidth;
  const els = [...document.querySelectorAll('body *')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > iw + 1;
  }).slice(0, 6).map((el) => {
    const r = el.getBoundingClientRect();
    return el.tagName.toLowerCase() + '|' + Math.round(r.right) + '|' + String(el.className || '').slice(0, 70);
  });
  return JSON.stringify({
    innerWidth: iw,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    overflowing: els,
  });
})()`;

const probe = async (send) => {
  const res = await send("Runtime.evaluate", {
    expression: PROBE,
    returnByValue: true,
  });
  return JSON.parse(res.result.value);
};

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "ui-check-"))}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

try {
  await waitForChrome();
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json();
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");

  const setSize = (width, height, mobile) =>
    cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });

  const lines = [];
  const failures = [];

  for (const [label, width, height, mobile] of [
    ["375", 375, 812, true],
    ["1440", 1440, 900, false],
  ]) {
    await setSize(width, height, mobile);
    for (const page of PAGES) {
      await cdp.send("Page.navigate", { url: `${BASE}${page}` });
      await sleep(700);
      const info = await probe(cdp.send);
      const over = info.scrollWidth - info.innerWidth;
      const ok = info.innerWidth === width && over <= 0;
      lines.push(
        `[${label}px] ${page} innerWidth=${info.innerWidth} scrollWidth=${info.scrollWidth} overflow=${over} ${ok ? "PASS" : "FAIL"}` +
          (info.overflowing.length ? `\n    overflow: ${info.overflowing.join(" ; ")}` : ""),
      );
      if (!ok && label === "375") failures.push(`${page} (+${over}px)`);
    }
  }

  mkdirSync(OUT, { recursive: true });

  await setSize(1440, 900, false);
  await cdp.send("Page.navigate", { url: `${BASE}/` });
  await sleep(900);
  let shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(OUT, "desktop-1440-home.png"), Buffer.from(shot.data, "base64"));
  const metrics = await cdp.send("Page.getLayoutMetrics");
  shot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: 1440,
      height: Math.min(metrics.contentSize.height, 4000),
      scale: 1,
    },
  });
  writeFileSync(path.join(OUT, "desktop-1440-home-full.png"), Buffer.from(shot.data, "base64"));

  await setSize(375, 812, true);
  for (const [name, page] of [
    ["mobile-375-home.png", "/"],
    ["mobile-375-chat.png", "/chat"],
    ["mobile-375-innovation.png", "/innovation"],
  ]) {
    await cdp.send("Page.navigate", { url: `${BASE}${page}` });
    await sleep(800);
    shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(OUT, name), Buffer.from(shot.data, "base64"));
  }

  const summary =
    `ui-mobile-check @ ${new Date().toISOString()}\n` +
    `pages=${PAGES.length} mobile=375x812 desktop=1440x900\n` +
    `375 failures: ${failures.length ? failures.join(", ") : "none"}\n\n` +
    lines.join("\n");
  writeFileSync(path.join(OUT, "ui-mobile-check.log"), summary, "utf8");
  console.log(summary);
  cdp.close();
} finally {
  chrome.kill();
}
