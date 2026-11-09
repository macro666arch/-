import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * 页面统一页头：图标 + 标题 + 说明 + 右侧动作。
 * 替代各页面自行复制的「9px 图标方块 + 24px 标题 + 12.5px 说明」结构。
 */
export default function PageHeader({
  icon: Icon,
  title,
  description,
  badge,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cuc-50 text-cuc-700">
          <Icon size={17} />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">{title}</h1>
            {badge}
          </div>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2 self-start">{actions}</div> : null}
    </div>
  );
}
