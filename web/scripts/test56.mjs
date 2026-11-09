/**
 * 56 题测试脚本（线3 交付物）
 * ------------------------------------------------------------
 * 为什么要有这个东西：
 *   答辩时评委最容易问的一句话是「你怎么知道它不乱编？」
 *   光说"我们做了提示词约束"没用，得有可复跑的测试数据。
 *
 * 用法：
 *   node scripts/test56.mjs                 # 走本地 mock（无需后端，随时能跑）
 *   node scripts/test56.mjs --http          # 打真实后端 http://localhost:3001/api/chat
 *   node scripts/test56.mjs --http --base http://localhost:3001
 *   node scripts/test56.mjs --md            # 额外输出 markdown 表格到 docs/测试报告.md
 *
 * 判定逻辑（三类，与《接口契约》2.2 一致）：
 *   answered    —— 必须有 ≥1 条 sources，且 answer 长度 > 0
 *   conflict    —— 必须有 conflicts 数组且长度 ≥ 2
 *   unconfirmed —— 必须给出 verify_channels（核实渠道），不能只说"不知道"
 *
 * 预期状态由每题的 expect 字段指定；实际状态不符即记为失败。
 * 另外做三项「反幻觉」检查：
 *   1. 所有来源 url 必须以 cuc.edu.cn 或已知官方域名为前缀
 *   2. answered 的答案不得包含「待核实」以外的不确定词堆砌（粗筛）
 *   3. unconfirmed 的答案不得出现具体电话号码（防止编造）
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const USE_HTTP = args.includes("--http");
const WANT_MD = args.includes("--md");
const baseIdx = args.indexOf("--base");
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : "http://localhost:3001";

/* ============================================================
   题目与判定：从 src/lib/cases.ts 引入（唯一数据源）
   —— 命令行脚本与 /test 网页必须用同一份，否则网页通过率会和实际不符
   ============================================================ */
import { CASES, validate } from "../src/lib/cases.ts";

/* ============================================================
   两种调用方式：本地 mock / 真实 HTTP 后端
   ============================================================ */
let _mock = null;
async function loadMock() {
  if (_mock) return _mock;
  _mock = await import("./mock-core.mjs");
  return _mock;
}

async function callMock(question) {
  const { mockChat } = await loadMock();
  return mockChat(question);
}

async function callHttp(question) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

/* ============================================================
   跑
   ============================================================ */
async function main() {
  const call = USE_HTTP ? callHttp : callMock;
  const mode = USE_HTTP ? `HTTP ${BASE}/api/chat` : "本地 mock-core（无需后端）";

  console.log(`\n中传校园信息助手 · 56 题回归测试`);
  console.log(`模式：${mode}`);
  console.log(`时间：${new Date().toLocaleString("zh-CN")}\n`);

  const rows = [];
  let pass = 0;
  const byDomain = {};
  const byStatus = { answered: 0, conflict: 0, unconfirmed: 0 };

  for (const c of CASES) {
    let res = null;
    let problems = [];
    const t0 = Date.now();
    try {
      res = await call(c.q);
      problems = validate(c, res);
    } catch (e) {
      problems = [`调用异常：${e instanceof Error ? e.message : String(e)}`];
    }
    const ms = Date.now() - t0;
    const ok = problems.length === 0;
    if (ok) pass++;

    byDomain[c.domain] ??= { total: 0, pass: 0 };
    byDomain[c.domain].total++;
    if (ok) byDomain[c.domain].pass++;
    if (res?.status) byStatus[res.status] = (byStatus[res.status] ?? 0) + 1;

    rows.push({ ...c, actual: res?.status ?? "-", ok, problems, ms, answer: res?.answer ?? "" });

    const mark = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`${mark} ${c.id} [${c.domain}] ${c.q}  → ${res?.status ?? "-"} (${ms}ms)`);
    if (!ok) {
      for (const p of problems) console.log(`    \x1b[31m· ${p}\x1b[0m`);
    }
  }

  /* ---------- 汇总 ---------- */
  const total = CASES.length;
  const rate = ((pass / total) * 100).toFixed(1);
  console.log(`\n${"─".repeat(60)}`);
  console.log(`总计：${pass}/${total} 通过（${rate}%）`);
  console.log(`\n按功能域：`);
  for (const [d, v] of Object.entries(byDomain)) {
    const r = ((v.pass / v.total) * 100).toFixed(0);
    console.log(`  ${d.padEnd(4)} ${v.pass}/${v.total}  ${r}%`);
  }
  console.log(`\n实际返回状态分布：`);
  console.log(`  有依据 ${byStatus.answered} · 冲突 ${byStatus.conflict} · 无法确认 ${byStatus.unconfirmed}`);
  console.log(`${"─".repeat(60)}\n`);

  /* ---------- markdown 报告 ---------- */
  if (WANT_MD) {
    const out = [];
    out.push("# 56 题回归测试报告\n");
    out.push(`- 模式：${mode}`);
    out.push(`- 时间：${new Date().toLocaleString("zh-CN")}`);
    out.push(`- 结果：**${pass}/${total} 通过（${rate}%）**\n`);
    out.push("## 按功能域\n");
    out.push("| 功能域 | 通过 | 总数 | 通过率 |");
    out.push("| --- | --- | --- | --- |");
    for (const [d, v] of Object.entries(byDomain)) {
      out.push(`| ${d} | ${v.pass} | ${v.total} | ${((v.pass / v.total) * 100).toFixed(0)}% |`);
    }
    out.push("\n## 三态分布\n");
    out.push("| 状态 | 数量 |");
    out.push("| --- | --- |");
    out.push(`| 有依据 answered | ${byStatus.answered} |`);
    out.push(`| 信息冲突 conflict | ${byStatus.conflict} |`);
    out.push(`| 无法确认 unconfirmed | ${byStatus.unconfirmed} |`);
    out.push("\n## 逐题结果\n");
    out.push("| # | 功能域 | 问题 | 期望 | 实际 | 结果 | 备注 |");
    out.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const r of rows) {
      out.push(
        `| ${r.id} | ${r.domain} | ${r.q} | ${r.expect} | ${r.actual} | ${r.ok ? "通过" : "**失败**"} | ${r.problems.join("；") || "-"} |`,
      );
    }
    out.push("\n## 判定标准\n");
    out.push("- **有依据**：至少 1 条来源，且来源域名在官方白名单内");
    out.push("- **信息冲突**：conflicts 至少 2 项（两个说法并列），来源域名合规");
    out.push("- **无法确认**：必须给出 verify_channels 核实渠道，不能只说「不知道」");
    out.push("- **反幻觉**：拒答时答案里不得出现未经来源标注的电话号码");
    out.push("- 期望状态来自我们对官网的实测结论，不是「希望它能答对」");
    // 直接写进 docs/，避免根目录和 docs/ 各存一份、内容还会不同步
    const p = resolve(ROOT, "docs/测试报告.md");
    writeFileSync(p, out.join("\n"), "utf8");
    console.log(`markdown 报告已写入：${p}`);
  }

  process.exit(pass === total ? 0 : 1);
}

main().catch((e) => {
  console.error("测试脚本自身出错：", e);
  process.exit(2);
});
