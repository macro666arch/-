/**
 * ICS 真实下载证据（Chrome headless + DevTools Protocol）
 * 用途：D4「日历导出」不再是代码层自证，而是在浏览器里真点一次：
 *   1) 在 /deadlines 把一条官方节点加入任务
 *   2) 到 /tasks 点「下载日历提醒」
 *   3) 校验落盘的 .ics 含 VCALENDAR / VALARM / 官方来源 URL
 * 运行：node scripts/ics-download-check.mjs（需前端已在 3000 端口运行）
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9334;
const BASE = "http://localhost:3000";
const OUT = path.resolve("../../autoeval/ics-round10");
const DOWNLOADS = path.join(OUT, "downloads");

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

const evalJs = async (send, expression) => {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result.value;
};

mkdirSync(OUT, { recursive: true });
rmSync(DOWNLOADS, { recursive: true, force: true });
mkdirSync(DOWNLOADS, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "ics-check-"))}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const lines = [];
const failures = [];
const check = (ok, text) => {
  lines.push(`${ok ? "PASS" : "FAIL"} ${text}`);
  if (!ok) failures.push(text);
};

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
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOADS,
    eventsEnabled: true,
  }).catch(() => {});
  await cdp.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOADS,
  }).catch(() => {});

  // 1. 截止页：把第一条可加入的官方节点加入任务
  await cdp.send("Page.navigate", { url: `${BASE}/deadlines` });
  await sleep(1500);
  const added = await evalJs(
    cdp.send,
    `(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '加入任务');
      if (!btn) return { ok: false, reason: 'no 加入任务 button' };
      btn.click();
      const title = btn.closest('article, li, div')?.textContent?.slice(0, 60) ?? '';
      return { ok: true, title };
    })()`,
  );
  check(added.ok, `在 /deadlines 点击「加入任务」${added.ok ? `（${added.title}）` : ""}`);
  await sleep(1200);
  await cdp
    .send("Page.captureScreenshot", { format: "png" })
    .then((shot) =>
      writeFileSync(path.join(OUT, "1-deadlines-added.png"), Buffer.from(shot.data, "base64")),
    );

  // 2. 任务页：真实点击 ICS 导出
  await cdp.send("Page.navigate", { url: `${BASE}/tasks` });
  await sleep(1500);
  const before = await evalJs(
    cdp.send,
    `document.querySelectorAll('button[title="下载日历提醒"]').length`,
  );
  check(Number(before) > 0, `任务页出现「下载日历提醒」按钮 ${before} 个`);
  const clicked = await evalJs(
    cdp.send,
    `(() => {
      const btn = document.querySelector('button[title="下载日历提醒"]');
      if (!btn) return false;
      btn.click();
      return true;
    })()`,
  );
  check(clicked, "浏览器内点击 ICS 导出按钮");
  await sleep(2500);
  await cdp
    .send("Page.captureScreenshot", { format: "png" })
    .then((shot) =>
      writeFileSync(path.join(OUT, "2-tasks-after-export.png"), Buffer.from(shot.data, "base64")),
    );

  // 3. 落盘校验
  const files = readdirSync(DOWNLOADS).filter((f) => f.toLowerCase().endsWith(".ics"));
  check(files.length > 0, `下载目录出现 .ics 文件 ${files.length} 个`);
  if (files.length > 0) {
    const file = path.join(DOWNLOADS, files[0]);
    const content = readFileSync(file, "utf-8");
    const checks = {
      文件名: files[0],
      大小: statSync(file).size,
      VCALENDAR: /BEGIN:VCALENDAR/.test(content),
      VEVENT: /BEGIN:VEVENT/.test(content),
      VALARM: /TRIGGER:-PT24H/.test(content),
      DTSTART: /DTSTART:\d{8}T\d{6}Z/.test(content),
      官方来源: /URL:https?:\/\/[^\r\n]*cuc\.edu\.cn/.test(content),
      事件标题: (content.match(/SUMMARY:.*/) || [""])[0],
    };
    for (const [key, value] of Object.entries(checks)) {
      lines.push(`   ${key}: ${value}`);
    }
    check(checks.VCALENDAR && checks.VEVENT, "ICS 结构完整（VCALENDAR + VEVENT）");
    check(checks.VALARM, "含提前 24 小时提醒（TRIGGER:-PT24H）");
    check(checks.DTSTART, "截止时间为 UTC 标准时间（DTSTART …Z）");
    check(checks.官方来源, "DESCRIPTION/URL 指向 cuc.edu.cn 官方来源");
    writeFileSync(path.join(OUT, "exported.ics"), content, "utf-8");
  }

  writeFileSync(path.join(OUT, "ics-download-check.log"), lines.join("\n") + "\n", "utf-8");
  console.log(lines.join("\n"));
  console.log(failures.length === 0 ? "\nRESULT: PASS" : `\nRESULT: FAIL (${failures.length})`);
} catch (error) {
  console.error("ics check crashed:", error.message);
  writeFileSync(path.join(OUT, "ics-download-check.log"), `CRASH: ${error.message}\n`, "utf-8");
  process.exitCode = 1;
} finally {
  chrome.kill();
}
