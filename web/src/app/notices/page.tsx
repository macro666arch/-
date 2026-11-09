"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Megaphone,
  AlertTriangle,
  Clock,
  Building2,
  Paperclip,
  ExternalLink,
  ArrowRight,
  Archive,
  CheckCircle2,
  Search,
} from "lucide-react";
import clsx from "clsx";
import { getNotices } from "@/lib/api";
import { useNotices } from "@/lib/useLive";
import DataBadge from "@/components/DataBadge";
import {
  VerifyBadge,
  EffectiveBadge,
  AttachmentBadge,
  StaleBadge,
} from "@/components/StatusBadge";
import { SourceCard, GapAlert, AttachmentRow, renderInline } from "@/components/SourceCard";
import type { Notice } from "@/lib/contract";

/**
 * 通知聚合页
 * ------------------------------------------------------------
 * 演示三个「官网做不到」的点：
 *  1. 归一化：官网 / 公众号 / 第三方用同一套字段呈现
 *  2. 过期折叠：已过截止自动转历史（官网仍然把它挂在列表里）
 *  3. 附件如实：空壳附件标「疑似空白」，不因为"有文件名"就说材料已给
 */

const STATUS_STYLE: Record<Notice["notice_status"], string> = {
  正在适用: "bg-state-okBg text-state-ok border-state-okBorder",
  已过截止: "bg-slate-100 text-slate-500 border-slate-200",
  历史: "bg-slate-100 text-slate-400 border-slate-200",
};

export default function NoticesPage() {
  const { data: notices, source, error, syncing } = useNotices(getNotices());
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"active" | "archived">("active");

  const active = notices.filter((n) => n.notice_status === "正在适用");
  const archived = notices.filter((n) => n.notice_status !== "正在适用");

  const list = useMemo(() => {
    const base = tab === "active" ? active : archived;
    const kw = q.trim().toLowerCase();
    if (!kw) return base;
    return base.filter((n) =>
      [n.notice_name, n.source, n.publish_dept ?? "", n.body_content ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(kw),
    );
  }, [tab, active, archived, q]);

  const badAttachments = notices.filter((n) =>
    n.attachments?.some((a) => a.status !== "正常"),
  ).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {/* ---------- 页头 ---------- */}
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">通知信息聚合</h1>
          <DataBadge source={source} error={error} syncing={syncing} />
        </div>
        <p className="mt-1.5 max-w-3xl text-[13.5px] leading-6 text-slate-600">
          官网、公众号、第三方渠道的通知归一化成同一套字段：截止日期、适用对象、材料要求、入口链接。
          <span className="font-medium text-slate-800">已过截止的自动转历史，不让旧通知冒充现行通知。</span>
          {badAttachments > 0 && (
            <> 有 {badAttachments} 条通知的附件不可用，已如实标注 —— 不会因为「挂着文件名」就告诉你材料已提供。</>
          )}
        </p>
      </div>

      {/* ---------- 顶部统计 ---------- */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <MiniStat n={active.length} label="正在适用" tone="ok" />
        <MiniStat n={archived.length} label="已过截止 / 历史" tone="muted" />
        <MiniStat
          n={notices.reduce((n, x) => n + (x.gaps?.length ?? 0), 0)}
          label="标注的原文缺陷"
          tone="warn"
        />
        <MiniStat n={badAttachments} label="附件不可用" tone="warn" />
      </div>

      {/* ---------- Tab + 搜索 ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
          <button
            onClick={() => setTab("active")}
            className={clsx(
              "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              tab === "active" ? "bg-cuc-600 text-white" : "text-slate-600 hover:bg-slate-50",
            )}
          >
            正在适用 {active.length}
          </button>
          <button
            onClick={() => setTab("archived")}
            className={clsx(
              "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              tab === "archived" ? "bg-cuc-600 text-white" : "text-slate-600 hover:bg-slate-50",
            )}
          >
            已过截止 {archived.length}
          </button>
        </div>
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-cuc-400">
          <Search size={13} className="shrink-0 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜通知标题、发布部门"
            className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {tab === "archived" && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
          <Archive size={11} className="mr-1 inline text-slate-400" />
          这些通知<span className="font-medium text-slate-800">仍然挂在官网列表里</span>，官网不会告诉你它已经过期。
          我们按截止日期把它们移到这里，但保留原文链接 —— 需要追溯往年政策时仍然查得到。
        </div>
      )}

      {/* ---------- 列表 ---------- */}
      <div className="space-y-2.5">
        {list.map((n) => (
          <NoticeCard key={n.id} n={n} />
        ))}
        {list.length === 0 && (
          <div className="card p-8 text-center text-[13px] text-slate-500">
            这个分类下没有匹配的通知。
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================ */

function NoticeCard({ n }: { n: Notice }) {
  const [expanded, setExpanded] = useState(false);
  const hasGaps = (n.gaps?.length ?? 0) > 0;
  const badAtt = n.attachments?.filter((a) => a.status !== "正常") ?? [];

  return (
    <div
      className={clsx(
        "card overflow-hidden",
        hasGaps && n.notice_status === "正在适用" && "border-state-warnBorder",
      )}
    >
      <div className="px-4 py-3">
        {/* 标题行 */}
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <span
            className={clsx("chip shrink-0 border", STATUS_STYLE[n.notice_status])}
          >
            {n.notice_status === "正在适用" ? (
              <CheckCircle2 size={9} />
            ) : (
              <Archive size={9} />
            )}
            {n.notice_status}
          </span>
          <span className="chip shrink-0 bg-slate-100 text-slate-600">
            <Building2 size={9} /> {n.channel}
          </span>
          <span className="min-w-0 flex-1 text-[14px] font-semibold leading-6 text-slate-800">
            {n.notice_name}
          </span>
          <VerifyBadge status={n.verify_status} />
          <EffectiveBadge status={n.effective_status} />
          <StaleBadge
            stale={n.stale}
            verified_months_ago={n.verified_months_ago}
            stale_reason={n.stale_reason}
          />
        </div>

        {/* 元信息 */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
          <span>{n.publish_dept ?? n.source}</span>
          {n.publish_date && <span>{n.publish_date}</span>}
          {n.deadline && (
            <span
              className={clsx(
                "inline-flex items-center gap-1",
                n.notice_status === "正在适用" ? "font-medium text-state-warn" : "text-slate-400",
              )}
            >
              <Clock size={10} /> 截止 {n.deadline}
            </span>
          )}
          {n.applicable_to && <span>适用：{n.applicable_to}</span>}
        </div>

        {/* 抽取字段 —— 展示"归一化"的价值 */}
        {n.extracted_fields && (
          <div className="mt-2 grid gap-1 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 sm:grid-cols-2">
            {(
              [
                ["截止", n.extracted_fields.deadline],
                ["适用对象", n.extracted_fields.applicable_to],
                ["材料要求", n.extracted_fields.material_requirements],
                ["办理入口", n.extracted_fields.entry],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex gap-1.5 text-[11.5px] leading-relaxed">
                <span className="shrink-0 text-slate-400">{k}：</span>
                <span className={v ? "text-slate-700" : "italic text-state-warn"}>
                  {v ?? "原文未写明"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 附件 */}
        {n.attachments && n.attachments.length > 0 && (
          <div className="mt-2">
            <div className="mb-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-500">
              <Paperclip size={10} /> 附件 {n.attachments.length}
              {badAtt.length > 0 && (
                <span className="chip bg-state-warnBg text-state-warn">
                  {badAtt.length} 个不可用
                </span>
              )}
            </div>
            <div className="space-y-1">
              {n.attachments.map((a, i) => (
                <AttachmentRow key={i} name={a.name} status={a.status} url={a.url} />
              ))}
            </div>
          </div>
        )}

        {/* 外链 */}
        {n.external_links && n.external_links.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {n.external_links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className={clsx(
                  "inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-[11.5px]",
                  l.accessible === false
                    ? "border-state-warnBorder text-state-warn"
                    : "border-slate-200 text-cuc-700 hover:border-cuc-300 hover:bg-cuc-50",
                )}
              >
                <ExternalLink size={10} /> {l.title}
                {l.publisher && <span className="text-slate-400">· {l.publisher}</span>}
                {l.accessible === false && <span>（打不开）</span>}
              </a>
            ))}
          </div>
        )}

        {/* 正文（可折叠） */}
        {n.body_content && (
          <div className="mt-2">
            <p
              className={clsx(
                "text-[12.5px] leading-relaxed text-slate-600",
                !expanded && "line-clamp-2",
              )}
            >
              {renderInline(n.body_content)}
            </p>
            {n.body_content.length > 90 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-0.5 text-[11.5px] text-cuc-600 hover:underline"
              >
                {expanded ? "收起" : "展开正文"}
              </button>
            )}
          </div>
        )}

        {/* 缺陷 */}
        {hasGaps && (
          <div className="mt-2">
            <GapAlert gaps={n.gaps} compact />
          </div>
        )}

        {/* 来源 */}
        <div className="mt-2.5">
          <SourceCard
            source={{
              title: `${n.source} — ${n.notice_name}`,
              url: n.source_url,
              publish_date: n.publish_date ?? null,
              verify_status: n.verify_status,
              effective_status: n.effective_status,
              stale: n.stale,
              verified_months_ago: n.verified_months_ago,
              stale_reason: n.stale_reason,
            }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
          <span>核对：{n.last_verified_at ?? "未标注"}</span>
          <Link
            href={`/chat?q=${encodeURIComponent(n.notice_name + "什么时候截止")}`}
            className="inline-flex items-center gap-1 text-cuc-600 hover:underline"
          >
            就这条通知提问 <ArrowRight size={10} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: "ok" | "warn" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "text-state-ok border-state-okBorder bg-state-okBg"
      : tone === "warn"
        ? "text-state-warn border-state-warnBorder bg-state-warnBg"
        : "text-slate-500 border-slate-200 bg-white";
  return (
    <div className={clsx("rounded-lg border px-3 py-2", cls)}>
      <div className="text-[18px] font-semibold tabular-nums leading-none">{n}</div>
      <div className="mt-1 text-[11.5px] opacity-80">{label}</div>
    </div>
  );
}
