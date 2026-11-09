import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import type { VerifyStatus, EffectiveStatus, ChatStatus, FreshnessFields } from "@/lib/contract";

/**
 * 状态徽章 —— 全站统一的状态语言
 * ------------------------------------------------------------
 * 本项目有 4 套状态，全部在这里收敛，避免每个页面各写一套颜色：
 *  1. ChatStatus      三态（answered / conflict / unconfirmed）—— 聊天答案
 *  2. VerifyStatus    二态（已核实 / 待核实）—— 数据条目
 *  3. EffectiveStatus 四态（现行 / 疑似过期 / 已失效 / 待核实）
 *  4. 附件/入口状态
 */

const chatMap: Record<ChatStatus, { label: string; cls: string; dot: string; desc: string }> = {
  answered: {
    label: "有依据",
    cls: "bg-state-okBg text-state-ok border-state-okBorder",
    dot: "bg-state-ok",
    desc: "知识库中检索到已核实、现行、无冲突的官方依据",
  },
  conflict: {
    label: "信息冲突",
    cls: "bg-state-warnBg text-state-warn border-state-warnBorder",
    dot: "bg-state-warn",
    desc: "命中多条互相矛盾的官方信息，无法判定唯一答案",
  },
  unconfirmed: {
    label: "无法确认",
    cls: "bg-state-stopBg text-state-stop border-state-stopBorder",
    dot: "bg-state-stop",
    desc: "知识库依据不足或已失效，按规则拒答",
  },
};

export function ChatStatusBadge({
  status,
  size = "md",
  showDot = true,
}: {
  status: ChatStatus;
  size?: "sm" | "md";
  showDot?: boolean;
}) {
  const m = chatMap[status];
  return (
    <span
      title={m.desc}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        m.cls,
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
      )}
    >
      {showDot && <span className={clsx("h-1.5 w-1.5 rounded-full", m.dot)} />}
      {m.label}
    </span>
  );
}

export function VerifyBadge({ status }: { status: VerifyStatus }) {
  if (status === "已核实") {
    return (
      <span className="chip bg-state-okBg text-state-ok" title="该字段已由人工核对官方原文">
        已核实
      </span>
    );
  }
  return (
    <span
      className="chip bg-state-warnBg text-state-warn"
      title="该字段来自官方页面，但存在矛盾或缺少关键信息，尚未人工确认"
    >
      待核实
    </span>
  );
}

export function EffectiveBadge({ status }: { status: EffectiveStatus }) {
  const map: Record<EffectiveStatus, string> = {
    现行: "chip bg-state-okBg text-state-ok",
    疑似过期: "chip bg-state-warnBg text-state-warn",
    已失效: "chip bg-state-stopBg text-state-stop",
    待核实: "chip bg-slate-100 text-slate-500",
  };
  return <span className={map[status]}>{status}</span>;
}

export function StaleBadge({
  stale,
  verified_months_ago,
  stale_reason,
}: Pick<FreshnessFields, "stale" | "verified_months_ago" | "stale_reason">) {
  if (!stale) return null;
  const months =
    typeof verified_months_ago === "number" && Number.isFinite(verified_months_ago)
      ? verified_months_ago
      : null;
  const label =
    months == null
      ? "待核实 · 已超过复核周期"
      : `待核实 · 上次核实 ${months} 月前`;
  return (
    <span
      className="chip bg-state-warnBg text-state-warn"
      title={stale_reason ?? "该条信息已超过复核周期，使用前建议向主管部门确认"}
    >
      <AlertTriangle size={9} />
      {label}
    </span>
  );
}

export function AttachmentBadge({
  status,
}: {
  status: "正常" | "疑似空白" | "无法读取" | "待人工核验";
}) {
  const map = {
    正常: "chip bg-state-okBg text-state-ok",
    疑似空白: "chip bg-state-warnBg text-state-warn",
    无法读取: "chip bg-state-stopBg text-state-stop",
    待人工核验: "chip bg-slate-100 text-slate-500",
  } as const;
  return <span className={map[status]}>{status}</span>;
}

/** 演示用：三态图例（首页 / 关于页） */
export const chatStatusLegend = chatMap;
