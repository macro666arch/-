/**
 * 联调自检：30 秒内确认甲的接口到底能不能接
 * ------------------------------------------------------------
 * 用法：
 *   node scripts/probe.mjs                       # 打 http://localhost:3001
 *   node scripts/probe.mjs http://1.2.3.4:3001   # 指定地址
 *
 * 它检查的是**契约 §2.4 承诺的形状**，不只是「有没有 200」：
 *   ① 每个端点能不能连通
 *   ② 列表是不是 { items: [...], total: N }
 *   ③ 关键字段在不在（少字段界面就会显示 undefined）
 *   ④ calendar 的 weeks 是不是 "1-17" 这种传输格式
 *
 * 通过之后，把 cuc-site/.env.local 改成 NEXT_PUBLIC_USE_MOCK=false 就能接。
 */

const BASE = process.argv[2] || process.env.PROBE_BASE || "http://localhost:3001";
const TIMEOUT = 5000;

const C = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  d: (s) => `\x1b[90m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

async function get(path) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctl.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 非 JSON */
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: "", err: e.message };
  } finally {
    clearTimeout(t);
  }
}

/** 列表形状检查：契约说必须是 { items, total } */
function checkListShape(json) {
  if (json == null) return { level: "bad", msg: "响应不是 JSON" };
  if (Array.isArray(json)) {
    return { level: "warn", msg: "返回裸数组，契约要求 { items, total }（前端能兼容，但建议甲改）" };
  }
  if (Array.isArray(json.items)) {
    const hasTotal = typeof json.total === "number";
    return hasTotal
      ? { level: "good", msg: `{ items: ${json.items.length} 条, total: ${json.total} }` }
      : { level: "warn", msg: `有 items 但缺 total 字段` };
  }
  return { level: "bad", msg: `没有 items 数组，实际键：${Object.keys(json).slice(0, 6).join(",") || "空"}` };
}

/** 字段检查：少这些字段界面会显示空白 */
function checkFields(items, required) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const sample = items[0];
  const missing = required.filter((k) => sample[k] === undefined);
  if (missing.length === 0) return { level: "good", msg: "关键字段齐全" };
  return { level: "warn", msg: `首条缺字段：${missing.join(", ")}` };
}

const results = [];

function record(name, level, msg) {
  results.push({ name, level, msg });
  const badge =
    level === "good" ? C.g("✓") : level === "warn" ? C.y("!") : C.r("✗");
  console.log(`  ${badge} ${name.padEnd(26)} ${msg}`);
}

async function checkList(path, required) {
  const r = await get(path);
  if (!r.ok) {
    record(path, "bad", r.err ? `连不上：${r.err}` : `HTTP ${r.status}`);
    return;
  }
  const shape = checkListShape(r.json);
  record(path, shape.level, shape.msg);
  if (shape.level !== "bad") {
    const f = checkFields(r.json.items, required);
    if (f) record(`${path} 字段`, f.level, f.msg);
  }
}

async function main() {
  console.log(C.b(`\n联调自检  →  ${BASE}\n`));
  console.log(C.d("检查契约 §2.4 承诺的 7 个端点 + 关键字段\n"));

  // 0. 先看后端到底在不在
  const h = await get("/api/health");
  if (!h.ok) {
    console.log(C.r(`  ✗ 后端未启动 / 无法访问`));
    console.log(C.d(`    ${h.err || `HTTP ${h.status}`}\n`));
    console.log(C.y("  先确认三件事："));
    console.log("    1. 甲那边确实启动了服务（不是只有代码）");
    console.log("    2. 地址和端口对不对（默认 3001）");
    console.log("    3. 防火墙有没有拦 —— 换 127.0.0.1 再试一次\n");
    console.log(C.d(`  手动验证：curl ${BASE}/api/health\n`));
    process.exit(1);
  }
  record("/api/health", h.json?.ok ? "good" : "warn", JSON.stringify(h.json));

  // 1. chat（最重要，三态行为）
  const chat = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "学籍管理科的电话是多少？" }),
  }).then((r) => r.json()).catch((e) => ({ __err: e.message }));

  if (chat.__err) {
    record("POST /api/chat", "bad", `请求失败：${chat.__err}`);
  } else {
    const okStatus = ["answered", "conflict", "unconfirmed"].includes(chat.status);
    record(
      "POST /api/chat",
      okStatus ? "good" : "bad",
      okStatus
        ? `status=${chat.status}，${(chat.sources ?? []).length} 条来源`
        : `status 非法：${JSON.stringify(chat.status)}`,
    );
    if (okStatus && !Array.isArray(chat.sources)) {
      record("POST /api/chat sources", "bad", "sources 不是数组");
    }
    if (okStatus && chat.status === "conflict" && !(chat.conflicts ?? []).length) {
      record(
        "POST /api/chat conflicts",
        "warn",
        "status=conflict 但没给 conflicts 数组，前端只能靠 answer 里的文字",
      );
    }
  }

  // 2–7. 列表端点
  await checkList("/api/contacts", ["business_name", "dept_name", "source", "source_url"]);
  await checkList("/api/processes", ["process_name", "steps", "source", "source_url"]);
  await checkList("/api/notices", ["notice_name", "notice_status", "source", "source_url"]);
  await checkList("/api/faq", ["question", "source", "source_url"]);
  await checkList("/api/service-hours", ["business_name", "open_days", "time_slot"]);

  // 8. calendar 单对象
  const cal = await get("/api/calendar");
  if (!cal.ok) {
    record("/api/calendar", "bad", cal.err ? `连不上：${cal.err}` : `HTTP ${cal.status}`);
  } else if (Array.isArray(cal.json)) {
    record("/api/calendar", "warn", "返回数组，契约说是单对象（前端两种都兼容）");
  } else {
    const j = cal.json ?? {};
    record(
      "/api/calendar",
      j.academic_year ? "good" : "bad",
      j.academic_year
        ? `${j.academic_year} ${j.semester ?? "?"}季，teaching_weeks=${JSON.stringify(j.teaching_weeks)}`
        : `缺 academic_year，键：${Object.keys(j).join(",")}`,
    );
    // weeks 是 "1-17" 字符串还是 {start,end} 对象，前端都能处理，只是提醒
    if (typeof j.teaching_weeks === "string") {
      record("/api/calendar 格式", "good", `teaching_weeks 是字符串 "${j.teaching_weeks}"（前端会转换）`);
    } else if (j.teaching_weeks && typeof j.teaching_weeks === "object") {
      record("/api/calendar 格式", "good", "teaching_weeks 已是 {start,end} 对象");
    }
    const missCommon = ["id", "source", "source_url", "verify_status"].filter(
      (k) => j[k] === undefined,
    );
    if (missCommon.length) {
      record(
        "/api/calendar 通用字段",
        "warn",
        `缺 ${missCommon.join(",")}（契约示例就没给，前端已用默认值+橙色提示）`,
      );
    }
  }

  // 9. 契约缺失的端点
  console.log("");
  const pol = await get("/api/policies");
  if (pol.ok) {
    record("/api/policies", "good", "甲补了这个接口（契约 §2.4 原本没有）");
  } else {
    record("/api/policies", "warn", "契约无此端点，规章制度页走本地数据（已知，不是 bug）");
  }

  // 汇总
  const bad = results.filter((r) => r.level === "bad").length;
  const warn = results.filter((r) => r.level === "warn").length;
  const good = results.filter((r) => r.level === "good").length;

  console.log(C.b(`\n汇总：`) + ` ${C.g(good + " 通过")} · ${C.y(warn + " 提醒")} · ${C.r(bad + " 失败")}\n`);

  if (bad === 0) {
    console.log(C.g("可以接了。") + " 把 cuc-site/.env.local 改成：\n");
    console.log("    NEXT_PUBLIC_USE_MOCK=false");
    console.log(`    NEXT_PUBLIC_API_BASE=${BASE}\n`);
    console.log(C.d("然后 npm run build && npm run start。页面右上角徽章会变成绿色「后端实时」。\n"));
  } else {
    console.log(C.r("还有失败项，先别切。") + " 前端现在走 mock，演示不受影响。\n");
    console.log(C.d("把上面 ✗ 的几行发给甲，让他确认端点路径和返回形状。\n"));
  }
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("自检脚本自身出错：", e);
  process.exit(2);
});
