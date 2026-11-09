"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  AlertTriangle,
  ArrowRight,
  Search,
  FileWarning,
  Link2,
  ShieldQuestion,
  Layers,
} from "lucide-react";
import clsx from "clsx";
import { getPolicies } from "@/lib/api";
import { usePolicies } from "@/lib/useLive";
import DataBadge from "@/components/DataBadge";
import { VerifyBadge, EffectiveBadge, StaleBadge } from "@/components/StatusBadge";
import { SourceCard, GapAlert, renderInline } from "@/components/SourceCard";
import type { Policy } from "@/lib/contract";

/**
 * 规章制度页
 * ------------------------------------------------------------
 * 这一页的核心演示点是「新旧版本共存」：
 *   官网同时挂着旧版和新版，旧版没有下线、没有标废止，搜索引擎还会优先推它。
 *   学生拿旧规定当现行用 → 白跑一趟。
 * 本页做法：同一制度做成「版本组」，明确标出哪版现行、哪版已被替代、差异在哪。
 */

const OCR_STYLE: Record<string, string> = {
  合格: "bg-state-okBg text-state-ok",
  需抽查: "bg-state-warnBg text-state-warn",
  不合格: "bg-state-stopBg text-state-stop",
};

export default function PoliciesPage() {
  const { data: policies, source, error, syncing } = usePolicies(getPolicies());
  const [q, setQ] = useState("");
  const [onlyCurrent, setOnlyCurrent] = useState(false);

  /** 已有替代版本的旧版 */
  const superseded = policies.filter((p) => p.is_superseded);
  const current = policies.filter((p) => !p.is_superseded);

  const filtered = useMemo(() => {
    const base = onlyCurrent ? current : policies;
    const kw = q.trim().toLowerCase();
    if (!kw) return base;
    return base.filter((p) =>
      [p.policy_name, p.doc_no, p.applicable_to, p.scope ?? "", p.content ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(kw),
    );
  }, [policies, current, onlyCurrent, q]);

  /* 版本关系在 PolicyCard 内部按 id 查找，这里不再预先分组 */

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">规章制度</h1>
          <DataBadge source={source} error={error} syncing={syncing} />
        </div>
        <p className="mt-1.5 max-w-3xl text-[13.5px] leading-6 text-slate-600">
          {policies.length} 份常用规定，标注版本关系、生效日期、OCR 可读性。
          {superseded.length > 0 && (
            <span className="font-medium text-slate-800">
              其中有 {superseded.length} 份已被新版替代，但官网既没下线也没标废止 ——
              我们替你把版本关系理清楚。
            </span>
          )}
        </p>
      </div>

      {/* ---------- 新旧并存告警 ---------- */}
      {superseded.length > 0 && (
        <div className="mb-5 rounded-xl border border-state-warnBorder bg-state-warnBg px-4 py-3">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-state-warn">
            <Layers size={14} /> {superseded.length} 份规定存在新旧版本同时在官网的情况
          </div>
          <ul className="mt-2 space-y-1.5">
            {superseded.map((p) => (
              <li key={p.id} className="text-[12.5px] leading-relaxed text-slate-600">
                <span className="font-medium text-slate-800">{p.policy_name}</span>
                <span className="mx-1 text-slate-400">→</span>
                已被
                <span className="mx-1 font-medium text-slate-800">
                  {p.superseded_by_name ?? p.superseded_by_id}
                </span>
                替代，但旧版页面仍然可以访问，也没有「已废止」标记。
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- 搜索 ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-cuc-400 focus-within:ring-2 focus-within:ring-cuc-100">
          <Search size={14} className="shrink-0 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜规定名称、文号、或条文内容 —— 例如「休学」「违纪」「转专业」"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
          />
        </div>
        <button
          onClick={() => setOnlyCurrent((v) => !v)}
          className={clsx(
            "chip !px-2.5 !py-2 transition-colors",
            onlyCurrent
              ? "bg-cuc-600 text-white"
              : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100",
          )}
        >
          只看现行版本
        </button>
        <span className="text-[11.5px] text-slate-400">
          {filtered.length} / {policies.length}
        </span>
      </div>

      {/* ---------- 列表 ---------- */}
      <div className="space-y-2.5">
        {filtered.map((p) => (
          <PolicyCard key={p.id} p={p} all={policies} />
        ))}
        {filtered.length === 0 && (
          <div className="card p-8 text-center text-[13px] text-slate-500">
            没有匹配的规定。知识库只收了本校高频适用的 {policies.length} 份，
            其它问题可以 <Link href="/chat" className="text-cuc-600 hover:underline">去问助手</Link>。
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-[12.5px] leading-6 text-slate-600">
        <p className="font-medium text-slate-800">关于「旧版」的处理原则</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>
            旧版<span className="font-medium text-slate-700">不隐藏、不删</span> ——
            往年入学的学生可能仍适用旧版，追溯时需要它。
          </li>
          <li>
            但会<span className="font-medium text-slate-700">明确标出「已被替代」</span>
            并给出替代版本链接，避免你误以为是现行规定。
          </li>
          <li>
            条文正文只从<span className="font-medium text-slate-700">OCR 质量合格</span>的文档里引用；
            质量不合格的（如劳动教育实施方案）只给链接，不摘录 —— 因为 OCR 错字可能改变原意。
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ============================================================ */

function PolicyCard({ p, all }: { p: Policy; all: Policy[] }) {
  const [open, setOpen] = useState(false);
  const [showContent, setShowContent] = useState(false);

  const newer = p.superseded_by_id ? all.find((x) => x.id === p.superseded_by_id) : null;
  const older = p.supersedes_id ? all.find((x) => x.id === p.supersedes_id) : null;
  const hasGaps = (p.gaps?.length ?? 0) > 0;
  const canQuote = p.ocr_quality === "合格" || p.ocr_quality == null;

  return (
    <div
      className={clsx(
        "card overflow-hidden",
        p.is_superseded && "border-slate-300 bg-slate-50/60",
        hasGaps && !p.is_superseded && "border-state-warnBorder",
      )}
    >
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          {p.is_superseded && (
            <span className="chip shrink-0 bg-state-stopBg text-state-stop">
              <FileWarning size={9} /> 已被替代
            </span>
          )}
          <span className="min-w-0 flex-1 text-[14px] font-semibold leading-6 text-slate-800">
            <span className={clsx(p.is_superseded && "text-slate-500")}>{p.policy_name}</span>
          </span>
          <VerifyBadge status={p.verify_status} />
          <EffectiveBadge status={p.effective_status} />
          <StaleBadge
            stale={p.stale}
            verified_months_ago={p.verified_months_ago}
            stale_reason={p.stale_reason}
          />
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
          <span className="tabular-nums">文号：{p.doc_no}</span>
          {p.effective_date && <span>生效：{p.effective_date}</span>}
          {p.expiry_date && <span className="text-state-warn">失效：{p.expiry_date}</span>}
          <span>适用：{p.applicable_to}</span>
          {p.ocr_quality && (
            <span className={clsx("chip", OCR_STYLE[p.ocr_quality])}>
              OCR {p.ocr_quality}
            </span>
          )}
        </div>

        {/* 版本关系 —— 本页最有价值的组件 */}
        {(newer || older) && (
          <div className="mt-2 space-y-1">
            {newer && (
              <div className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] leading-relaxed">
                <Link2 size={11} className="mt-0.5 shrink-0 text-cuc-500" />
                <span className="text-slate-600">
                  此版本已被新版替代：
                  <span className="ml-1 font-medium text-slate-800">{newer.policy_name}</span>
                  {newer.effective_date && (
                    <span className="ml-1 text-slate-400">（{newer.effective_date} 生效）</span>
                  )}
                  <span className="ml-1 text-state-stop">—— 请以新版为准</span>
                </span>
              </div>
            )}
            {older && (
              <div className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] leading-relaxed">
                <Link2 size={11} className="mt-0.5 shrink-0 text-slate-400" />
                <span className="text-slate-600">
                  本版替代了旧版：
                  <span className="ml-1 font-medium text-slate-700">{older.policy_name}</span>
                  <span className="ml-1 text-slate-400">（旧版仍在官网可访问）</span>
                </span>
              </div>
            )}
          </div>
        )}

        {p.scope && (
          <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
            <span className="font-medium text-slate-600">适用范围：</span>
            {p.scope}
          </p>
        )}

        {/* 正文摘录 */}
        {p.content && (
          <div className="mt-2">
            {!canQuote && (
              <div className="mb-1 inline-flex items-center gap-1 rounded bg-state-stopBg px-2 py-0.5 text-[11px] text-state-stop">
                <ShieldQuestion size={9} />
                OCR 质量{p.ocr_quality}，正文不摘录（避免错字改变原意），请点来源看原文
              </div>
            )}
            {canQuote ? (
              <>
                <p
                  className={clsx(
                    "rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-relaxed text-slate-600",
                    !showContent && "line-clamp-3",
                  )}
                >
                  {renderInline(p.content)}
                </p>
                {p.content.length > 110 && (
                  <button
                    onClick={() => setShowContent((v) => !v)}
                    className="mt-1 text-[11.5px] text-cuc-600 hover:underline"
                  >
                    {showContent ? "收起摘录" : "展开摘录"}
                  </button>
                )}
              </>
            ) : null}
          </div>
        )}

        {hasGaps && (
          <div className="mt-2">
            <GapAlert gaps={p.gaps} compact />
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[11.5px] text-slate-500 hover:text-cuc-600"
          >
            {open ? "收起来源" : "核对原文来源"}
          </button>
          <Link
            href={`/chat?q=${encodeURIComponent(p.policy_name.slice(0, 12) + "怎么规定的")}`}
            className="inline-flex items-center gap-1 text-[11.5px] text-cuc-600 hover:underline"
          >
            就这份规定提问 <ArrowRight size={10} />
          </Link>
        </div>

        {open && (
          <div className="mt-2">
            <SourceCard
              source={{
                title: `${p.policy_name}（${p.doc_no}）`,
                url: p.source_url,
                publish_date: p.publish_date ?? null,
                verify_status: p.verify_status,
                effective_status: p.effective_status,
                stale: p.stale,
                verified_months_ago: p.verified_months_ago,
                stale_reason: p.stale_reason,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
