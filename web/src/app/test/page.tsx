"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CASES, validate, type Domain, type Expect } from "@/lib/cases";
import { mockChat } from "@/lib/mock/chat";
import { API_BASE } from "@/lib/http";
import { ChatStatusBadge } from "@/components/StatusBadge";

/**
 * 56 题测试报告页（答辩展示用）
 * ------------------------------------------------------------
 * 关键设计：这个页面**当场跑真引擎**，不是把一份报告写死在这里。
 * 判定逻辑直接 import 自 src/lib/cases.ts —— 与命令行脚本完全同一份。
 * C6：支持「本地缓跑（mock）」与「真实后端 API」两种数据源切换，
 * 真实模式直接 POST /api/chat，失败按未通过记录，不静默退回 mock。
 */

const DOMAINS: Domain[] = ["咨询", "流程", "通知", "制度", "时间", "边界"];
type Mode = "mock" | "live";

type Row = {
  id: string;
  domain: Domain;
  q: string;
  expect: Expect;
  why: string;
  actual: string;
  ok: boolean;
  problems: string[];
};

export default function TestPage() {
  const [filter, setFilter] = useState<Domain | "全部">("全部");
  const [onlyFail, setOnlyFail] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("mock");
  const [runAt, setRunAt] = useState(() => Date.now());
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [fatal, setFatal] = useState("");

  /** 真实后端：直接打 /api/chat，失败如实抛出，不退回 mock */
  async function liveChat(q: string) {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, resolved_question: q }),
    });
    if (!response.ok) {
      throw new Error(
        response.status === 429 ? "接口限流 HTTP 429，请稍后再试" : `接口返回 HTTP ${response.status}`,
      );
    }
    return response.json();
  }

  /** 现场跑一遍全部 56 题（mock 同步、live 逐题异步，带进度） */
  useEffect(() => {
    let cancelled = false;
    setRunning(true);
    setFatal("");
    setFinishedAt(null);
    setRows([]);

    (async () => {
      const out: Row[] = [];
      for (const c of CASES) {
        if (cancelled) return;
        let res: any = null;
        let problems: string[] = [];
        try {
          res = mode === "mock" ? mockChat(c.q) : await liveChat(c.q);
          problems = validate(c, res);
        } catch (e: any) {
          problems = [`调用异常：${e?.message ?? String(e)}`];
        }
        const ok = problems.length === 0;
        out.push({ ...c, actual: res?.status ?? "-", ok, problems });
        if (!cancelled) setRows([...out]);
      }
      if (cancelled) return;
      setRunning(false);
      setFinishedAt(Date.now());
      const failed = out.filter((r) => r.problems.some((p) => p.startsWith("调用异常"))).length;
      if (failed > 0) {
        setFatal(
          `${failed}/${out.length} 题调用失败，请确认后端已启动（${API_BASE}）或切回本地缓跑。`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, runAt]);

  const { pass, byDomain, byStatus } = useMemo(() => {
    const bd: Record<string, { total: number; pass: number }> = {};
    const bs: Record<string, number> = { answered: 0, conflict: 0, unconfirmed: 0 };
    let p = 0;
    for (const r of rows) {
      if (r.ok) p++;
      bd[r.domain] ??= { total: 0, pass: 0 };
      bd[r.domain].total++;
      if (r.ok) bd[r.domain].pass++;
      if (r.actual && r.actual !== "-") bs[r.actual] = (bs[r.actual] ?? 0) + 1;
    }
    return { pass: p, byDomain: bd, byStatus: bs };
  }, [rows]);

  const shown = rows.filter(
    (r) => (filter === "全部" || r.domain === filter) && (!onlyFail || !r.ok),
  );
  const rate = rows.length > 0 ? ((pass / rows.length) * 100).toFixed(1) : "0.0";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* ---------- 标题 ---------- */}
      <header className="mb-8">
        <div className="chip chip-ok mb-3">可复跑 · 现场执行</div>
        <h1 className="text-[26px] font-bold text-slate-900">56 题回归测试</h1>
        <p className="mt-3 text-[14.5px] leading-7 text-slate-600">
          这个页面<strong>不是一份写死的报告</strong>——它在你打开时当场跑一遍问答引擎，
          用的判定规则和命令行<span className="kd">node scripts/test56.mjs</span>完全同一份。
          如果引擎坏了，这里会立刻变红。
        </p>
        <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {([
            ["mock", "本地缓跑（mock）"],
            ["live", "真实后端 API"],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m as Mode)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
                mode === m ? "bg-cuc-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-2 self-center pr-2 text-[11px] text-slate-400">
            {mode === "mock" ? "本地知识库作答" : `POST ${API_BASE}/api/chat`}
          </span>
        </div>
      </header>

      {/* ---------- 运行状态 ---------- */}
      <div className="mb-6 rounded-xl border border-state-okBorder bg-state-okBg p-5">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className="text-[40px] font-bold leading-none text-state-ok">{pass}</span>
          <span className="pb-1 text-[18px] text-slate-500">/ {rows.length || CASES.length}</span>
          <span className="pb-1.5 text-[15px] font-semibold text-state-ok">通过（{rate}%）</span>
        </div>
        <p className="mt-2 text-[13px] text-slate-500">
          {running
            ? `正在跑第 ${rows.length + 1} / ${CASES.length} 题（${mode === "mock" ? "本地缓跑" : "真实后端"}）…`
            : finishedAt
              ? `判定完成：${new Date(finishedAt).toLocaleString("zh-CN")}`
              : "准备中…"}
        </p>
      </div>

      {fatal && (
        <div className="mb-6 rounded-lg border border-state-stopBorder bg-state-stopBg p-3 text-[12.5px] text-state-stop">
          {fatal}
        </div>
      )}

      {/* ---------- 三态分布 ---------- */}
      <SectionHead title="三态分布" />
      <div className="mb-6 grid grid-cols-3 gap-3">
        {(["answered", "conflict", "unconfirmed"] as const).map((s) => {
          const label = { answered: "有依据", conflict: "信息冲突", unconfirmed: "无法确认" }[s];
          return (
            <div key={s} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
              <div className="text-[22px] font-bold text-slate-900">{byStatus[s] ?? 0}</div>
              <div className="mt-1">
                <ChatStatusBadge status={s} size="sm" />
              </div>
              <div className="mt-1 text-[11px] text-slate-400">{label}</div>
            </div>
          );
        })}
      </div>

      {/* ---------- 按功能域 ---------- */}
      <SectionHead title="按功能域" />
      <div className="mb-6 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">功能域</th>
              <th className="px-3 py-2 font-medium">通过</th>
              <th className="px-3 py-2 font-medium">通过率</th>
              <th className="w-1/2 px-3 py-2 font-medium">可视化</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {DOMAINS.map((d) => {
              const x = byDomain[d];
              if (!x) return null;
              const r = (x.pass / x.total) * 100;
              return (
                <tr key={d}>
                  <td className="px-3 py-2 font-medium text-slate-700">{d}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {x.pass}/{x.total}
                  </td>
                  <td className={`px-3 py-2 font-semibold ${r === 100 ? "text-state-ok" : "text-state-warn"}`}>
                    {r.toFixed(0)}%
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${r === 100 ? "bg-state-ok" : "bg-state-warn"}`}
                        style={{ width: `${r}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- 判定标准 ---------- */}
      <SectionHead title="判定标准（这就是「不许瞎编」的落地）" />
      <div className="mb-6 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-[13px] leading-6 text-slate-700">
        <p>
          <strong>① answered（有依据）</strong>：必须有 ≥1 条 sources，且每条 url 落在官方域名白名单内。
          <span className="text-slate-500">无来源作答 → 判失败。</span>
        </p>
        <p>
          <strong>② conflict（信息冲突）</strong>：必须有 ≥2 个并列说法，每个都带 value。
          <span className="text-slate-500">只给一个「官方答案」而实际存在矛盾 → 判失败。</span>
        </p>
        <p>
          <strong>③ unconfirmed（无法确认）</strong>：必须给出 verify_channels（核实渠道）。
          <span className="text-slate-500">只说「不知道」→ 判失败。</span>
        </p>
        <p>
          <strong>④ 反幻觉扫描</strong>：拒答时若答案里出现未标注来源的电话号码（
          <span className="kd">6578xxxx</span> / <span className="kd">6577xxxx</span>）→ 判失败。
        </p>
      </div>

      {/* ---------- 筛选 ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter("全部")}
          className={`chip ${filter === "全部" ? "chip-ok" : "border-slate-200 bg-white text-slate-600"}`}
        >
          全部 {rows.length}
        </button>
        {DOMAINS.map((d) => (
          <button
            key={d}
            onClick={() => setFilter(d)}
            className={`chip ${filter === d ? "chip-ok" : "border-slate-200 bg-white text-slate-600"}`}
          >
            {d} {byDomain[d]?.total ?? 0}
          </button>
        ))}
        <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-[12.5px] text-slate-600">
          <input
            type="checkbox"
            checked={onlyFail}
            onChange={(e) => setOnlyFail(e.target.checked)}
            className="h-3.5 w-3.5 accent-cuc-600"
          />
          只看失败
        </label>
        <button
          onClick={() => setRunAt(Date.now())}
          disabled={running}
          className="ml-auto btn-ghost !px-2.5 !py-1 !text-[12px]"
        >
          重新跑一遍
        </button>
      </div>

      {/* ---------- 明细 ---------- */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        {shown.length === 0 ? (
          <div className="p-8 text-center text-[13.5px] text-slate-400">
            {running ? "正在逐题执行，结果会实时出现…" : "这个筛选条件下没有题目。"}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                      r.ok ? "bg-state-ok" : "bg-state-stop"
                    }`}
                  >
                    {r.ok ? "✓" : "✗"}
                  </span>
                  <span className="w-9 shrink-0 font-mono text-[11px] text-slate-400">{r.id}</span>
                  <span className="flex-1 text-[13.5px] text-slate-800">{r.q}</span>
                  <span className="shrink-0">
                    {r.actual === "answered" ||
                    r.actual === "conflict" ||
                    r.actual === "unconfirmed" ? (
                      <ChatStatusBadge status={r.actual} size="sm" />
                    ) : (
                      <span className="text-[11px] text-slate-400">未返回</span>
                    )}
                  </span>
                </button>
                {openId === r.id && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[12.5px] leading-6">
                    <Row k="出题意图" v={r.why} />
                    <Row
                      k="期望状态"
                      v={
                        <span className="font-mono text-[11.5px]">
                          {r.expect} / 实际 {r.actual}
                        </span>
                      }
                    />
                    {r.problems.length > 0 ? (
                      <div className="mt-2 rounded border border-state-stopBorder bg-state-stopBg p-2">
                        <p className="font-semibold text-state-stop">未通过原因</p>
                        <ul className="mt-1 list-inside list-disc text-slate-700">
                          {r.problems.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-2 text-state-ok">✓ 三项判定全部满足</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- 说明 ---------- */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-[15px] font-bold text-slate-900">为什么这 56 题值得信</h3>
        <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
          <li>
            · <strong>期望值来自对官网的实测</strong>，不是「希望它能答对」。比如「休学最多多久」
            期望值是<strong>无法确认</strong>，因为官网两版都没写年限。
          </li>
          <li>
            · <strong>2 道题的期望值被我们改过</strong>，改动原因写在{" "}
            <span className="kd">src/lib/cases.ts</span> 的注释里。发现自己的期望错了就改，
            而不是把答案硬凑成期望。
          </li>
          <li>
            · <strong>命令行与网页共用同一份题目和判定</strong>（都 import 自{" "}
            <span className="kd">src/lib/cases.ts</span>），不存在「演示一套、实跑另一套」。
          </li>
          <li>
            · <strong>换数据源也照样能测</strong>：页面顶部可切换
            <span className="kd">本地缓跑（mock）</span>与
            <span className="kd">真实后端 API</span>，真实模式逐题 POST
            <span className="kd">/api/chat</span>，判定规则不变；
            命令行对应 <span className="kd">node scripts/test56.mjs --http</span>。
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/chat" className="btn-primary !text-[13px]">
            去问答页自己试
          </Link>
          <Link href="/about" className="btn-ghost !text-[13px]">
            看设计原则
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 局部组件 ---------------- */

function SectionHead({ title }: { title: string }) {
  return (
    <h2 className="mb-3 border-l-[3px] border-cuc-500 pl-3 text-[16px] font-bold text-slate-900">
      {title}
    </h2>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <p className="flex gap-2">
      <span className="w-16 shrink-0 text-slate-400">{k}</span>
      <span className="text-slate-700">{v}</span>
    </p>
  );
}
