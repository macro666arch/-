import { AlertTriangle, Info, ExternalLink, Quote } from "lucide-react";
import {
  VerifyBadge,
  EffectiveBadge,
  AttachmentBadge,
  StaleBadge,
} from "@/components/StatusBadge";
import type { Process, Notice, Contact, Policy, Source } from "@/lib/contract";

/**
 * 来源卡 + 缺陷提示条
 * ------------------------------------------------------------
 * 这两个组件是全站的"可信度语言"：
 *  - SourceCard：每个答案下面必须有的「官方来源」
 *  - GapAlert：官方原文自身的缺陷，橙色显式提示（核心卖点）
 */

export function SourceCard({ source }: { source: Source }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-cuc-300 hover:bg-cuc-50/40"
    >
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-cuc-50 text-cuc-600">
        <Quote size={12} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-slate-800">{source.title}</span>
          <ExternalLink
            size={11}
            className="shrink-0 text-slate-300 transition-colors group-hover:text-cuc-500"
          />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1">
          {source.publish_date && (
            <span className="text-[11px] text-slate-400">{source.publish_date}</span>
          )}
          {source.verify_status && <VerifyBadge status={source.verify_status} />}
          {source.effective_status && <EffectiveBadge status={source.effective_status} />}
          <StaleBadge
            stale={source.stale}
            verified_months_ago={source.verified_months_ago}
            stale_reason={source.stale_reason}
          />
        </span>
        {source.stale && source.stale_reason && (
          <span className="mt-1 block text-[11px] leading-4 text-state-warn">
            {source.stale_reason}
          </span>
        )}
        <span className="mt-0.5 block truncate text-[11px] text-slate-400">{source.url}</span>
      </span>
    </a>
  );
}

/**
 * 官方原文缺陷提示 —— 橙色，显式，不折叠。
 * 这是本产品最想被看到的东西：不只是"搬运官网"，而是"指出官网哪里不清楚"。
 */
export function GapAlert({
  gaps,
  title = "官方原文存在的问题",
  compact = false,
}: {
  gaps?: string[] | null;
  title?: string;
  compact?: boolean;
}) {
  if (!gaps || gaps.length === 0) return null;
  return (
    <div className="rounded-lg border border-state-warnBorder bg-state-warnBg px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={13} className="text-state-warn" />
        <span className="text-[12px] font-semibold text-state-warn">
          {title}（{gaps.length}）
        </span>
      </div>
      <ul className={compact ? "mt-1.5 space-y-1" : "mt-2 space-y-1.5"}>
        {gaps.map((g, i) => (
          <li
            key={i}
            className="flex gap-1.5 text-[12.5px] leading-relaxed text-amber-900"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-state-warn/60" />
            <span dangerouslySetInnerHTML={{ __html: renderInline(g) }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 极简行内 markdown：**粗体** 与 `代码`，够用且不引库 */
export function renderInline(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/`(.+?)`/g, '<code class="kd">$1</code>');
}

/** 信息条（中性提示） */
export function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-600">
      <Info size={13} className="mt-0.5 shrink-0 text-slate-400" />
      <div>{children}</div>
    </div>
  );
}

/** 附件状态行 */
export function AttachmentRow({
  name,
  status,
  url,
}: {
  name: string;
  status: "正常" | "疑似空白" | "无法读取" | "待人工核验";
  url?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-700">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="hover:text-cuc-600 hover:underline">
            {name}
          </a>
        ) : (
          name
        )}
      </span>
      <AttachmentBadge status={status} />
    </div>
  );
}
