"use client";

import type { DataSource } from "@/lib/api";

/**
 * 数据来源徽章
 * ------------------------------------------------------------
 * 为什么要在界面上显示这个：
 * 答辩时如果评委问「你这些数据是后端给的还是你自己写的」，
 * 徽章就是答案——而且它不会说谎，因为它按实际请求结果渲染。
 *
 * 三种状态：
 *   mock    灰  本地知识库（演示默认）
 *   live    绿  后端接口
 *   fallback 橙 后端没连上，已退回本地（橙色，因为这不是正常状态）
 */

const MAP: Record<DataSource, { label: string; cls: string; dot: string; tip: string }> = {
  mock: {
    label: "本地知识库",
    cls: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    tip: "未连接后端，数据来自项目内置的知识库快照",
  },
  live: {
    label: "后端实时",
    cls: "bg-state-okBg text-state-ok border-state-okBorder",
    dot: "bg-state-ok",
    tip: "数据来自后端接口 /api/*",
  },
  fallback: {
    label: "后端未连通",
    cls: "bg-state-warnBg text-state-warn border-state-warnBorder",
    dot: "bg-state-warn",
    tip: "后端请求失败，已自动退回本地知识库",
  },
};

export default function DataBadge({
  source,
  error,
  syncing,
  size = "sm",
}: {
  source: DataSource;
  error?: string;
  /** 首次 live 请求进行中，显示「同步中」而不是谎报已接通 */
  syncing?: boolean;
  size?: "sm" | "xs";
}) {
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";

  if (syncing) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 ${pad} font-medium text-slate-500`}
        title="首屏先用本地知识库渲染，正在向后端请求最新数据"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
        同步中
      </span>
    );
  }

  const m = MAP[source];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border ${pad} font-medium ${m.cls}`}
      title={error ? `${m.tip}\n原因：${error}` : m.tip}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}