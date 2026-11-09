"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, ClipboardCheck, Phone, X } from "lucide-react";

const links = [
  {
    href: "/processes",
    icon: ClipboardCheck,
    title: "我要办事",
    note: "流程与材料",
  },
  {
    href: "/deadlines",
    icon: CalendarClock,
    title: "我要查截止",
    note: "官方日期",
  },
  {
    href: "/contacts",
    icon: Phone,
    title: "我要找部门",
    note: "电话与地点",
  },
];

const STORAGE_KEY = "cuc-workbench-hint";

/**
 * 进入工作台时出现一次的小提示：以聊天气泡的形式指向三个常用入口，
 * 替代原先占据首屏下方整块的快捷入口。
 */
export default function WorkbenchHint() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(STORAGE_KEY, "1");
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!open) return null;

  return (
    <aside
      aria-label="工作台入口提示"
      className="anim-in fixed bottom-20 left-4 z-30 w-[262px] sm:bottom-6"
    >
      <div className="relative rounded-lg border border-line bg-white/95 p-3 shadow-[0_14px_34px_-22px_rgba(22,32,43,0.45)] backdrop-blur">
        <span className="absolute -bottom-1.5 left-7 h-3 w-3 rotate-45 border-b border-r border-line bg-white" />
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11.5px] font-semibold text-ink">不知道从哪开始？</p>
            <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
              我可以直接带你去这三个地方。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setOpen(false)}
            className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center text-slate-400 transition-colors hover:text-ink"
          >
            <X size={12} />
          </button>
        </div>
        <div className="mt-2 grid gap-0.5">
          {links.map(({ href, icon: Icon, title, note }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center justify-between gap-2 rounded-[2px] px-1.5 py-1.5 transition-colors hover:bg-paper"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon size={12} className="shrink-0 text-cuc-700" />
                <span className="truncate text-[11.5px] text-slate-700">{title}</span>
                <span className="truncate text-[10px] text-slate-400">{note}</span>
              </span>
              <ArrowRight
                size={11}
                className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
