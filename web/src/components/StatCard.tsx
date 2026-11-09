import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

/**
 * 页面顶部统计卡。合并 deadlines / research / tasks 三处各自实现的 Metric。
 * size="md" 保留任务页原有的略大排版，size="sm" 用于其余页面。
 */
export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  size = "sm",
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "default" | "warn" | "stop";
  size?: "sm" | "md";
}) {
  const md = size === "md";
  return (
    <div
      className={clsx(
        "rounded-lg border border-slate-200 bg-white px-3",
        md ? "py-3" : "py-2.5",
      )}
    >
      <div
        className={clsx(
          "flex items-center text-slate-500",
          md ? "gap-2 text-[11.5px]" : "gap-1.5 text-[11px]",
        )}
      >
        <Icon
          size={md ? 14 : 12}
          className={
            tone === "stop"
              ? "text-state-stop"
              : tone === "warn"
                ? "text-state-warn"
                : "text-cuc-600"
          }
        />
        {label}
      </div>
      <div
        className={clsx(
          "mt-1 font-semibold tabular-nums leading-none",
          md ? "text-[22px]" : "text-[20px]",
          tone === "stop"
            ? "text-state-stop"
            : tone === "warn"
              ? "text-state-warn"
              : "text-slate-900",
        )}
      >
        {value}
      </div>
    </div>
  );
}
