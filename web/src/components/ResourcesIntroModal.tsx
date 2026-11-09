"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, X } from "lucide-react";

/**
 * 校园资料页进入弹窗：每次切到 /resources 时弹出一次，
 * 说明资料可信度分级与当前缺口/冲突统计。
 */
export default function ResourcesIntroModal({
  gapCount,
  conflictCount,
}: {
  gapCount: number;
  conflictCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(true), 350);
    return () => window.clearTimeout(timer);
  }, []);

  // 入场动效用状态切换而非纯 CSS keyframes：避免标签页不可见时动画冻结在 opacity:0 第一帧
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    const fallback = setTimeout(() => setEntered(true), 500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !mounted) return null;

  const close = () => setOpen(false);

  return createPortal(
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="资料可信度说明"
    >
      <div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[3px]"
        onClick={close}
      />
      <div
        className="resources-intro-panel relative w-full max-w-md rounded-2xl border border-line bg-paper p-5 shadow-[0_24px_80px_rgba(15,23,42,.28)] transition-all duration-500 ease-out sm:p-6"
        style={entered ? undefined : { opacity: 0, transform: "translateY(18px) scale(.97)" }}
      >
        <button
          type="button"
          onClick={close}
          aria-label="关闭"
          className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-full border border-line text-slate-500 transition-colors hover:border-cuc-300 hover:text-cuc-700"
        >
          <X size={13} />
        </button>

        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-state-ok" />
          <h2 className="text-[15px] font-semibold text-ink">资料不是同一种可信度</h2>
        </div>

        <div className="mt-3.5 grid gap-2">
          <div className="rounded-lg border border-state-okBorder bg-state-okBg px-3 py-2.5 text-state-ok">
            <p className="text-[12px] font-semibold">官网明确</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-600">保留原文、来源链接和核对日期。</p>
          </div>
          <div className="rounded-lg border border-cuc-100 bg-cuc-50 px-3 py-2.5 text-cuc-700">
            <p className="text-[12px] font-semibold">系统整理</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-600">为便于执行而补充，不冒充官方要求。</p>
          </div>
          <div className="rounded-lg border border-state-warnBorder bg-state-warnBg px-3 py-2.5 text-state-warn">
            <p className="text-[12px] font-semibold">待核实</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-600">原文冲突、缺失或附件不可用时明确提示。</p>
          </div>
        </div>

        <p className="mt-3.5 text-[11.5px] leading-5 text-slate-500">
          当前页面标出 {gapCount} 处官方原文缺口，{conflictCount} 处新旧版本或电话冲突。点进具体条目后都能回到
          <span className="mx-1 font-medium text-slate-700">cuc.edu.cn 原文</span>
          核对。
        </p>

        <button type="button" onClick={close} className="btn-primary mt-4 w-full justify-center">
          知道了
        </button>
      </div>

      <style>{`
        .resources-intro-panel { animation: resources-intro-in .45s cubic-bezier(.22,.9,.3,1) both; }
        @keyframes resources-intro-in {
          from { opacity: 0; transform: translateY(18px) scale(.97); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .resources-intro-panel { animation: none; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
