"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import IntroOverlay from "./IntroOverlay";
import { runCarveIntro } from "./intro/carveEngine";

/**
 * 刻线开场（React 外壳）
 *
 * 绘制全部在 intro/carveEngine.ts 里（纯 Canvas 2D），这里只负责：
 * 挂载判定、跳过、卸载、派发 cuc-intro-ended。
 *
 * 行为：
 * - 每会话只播一次（sessionStorage: cuc-intro-seen）
 * - 点击 / ESC / 空格跳过
 * - prefers-reduced-motion 直接跳过
 * - ?intro-debug 强制重播；?intro-freeze=毫秒 定格某帧
 * - ?intro=video 回退到原来的 IntroOverlay（Blender 成片）
 * - 无音轨
 */
export const INTRO_ENDED_EVENT = "cuc-intro-ended";
const SEEN_KEY = "cuc-intro-seen";

export default function IntroCarve() {
  const [phase, setPhase] = useState<"hidden" | "playing" | "leaving">("hidden");
  const [mode, setMode] = useState<"carve" | "video">("carve");
  const [freezeMs, setFreezeMs] = useState<number | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const announced = useRef(false);
  const finishing = useRef(false);

  const announce = useCallback(() => {
    if (announced.current) return;
    announced.current = true;
    window.dispatchEvent(new Event(INTRO_ENDED_EVENT));
  }, []);

  const finish = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    setPhase((p) => (p === "hidden" ? p : "leaving"));
    window.setTimeout(() => {
      setPhase("hidden");
      announce();
    }, 360);
  }, [announce]);

  /* 挂载判定 */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("intro") === "video") {
      setMode("video");
      return;
    }
    const rawFreeze = params.get("intro-freeze");
    const debug = params.has("intro-debug") || rawFreeze !== null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen: string | null = null;
    try {
      seen = sessionStorage.getItem(SEEN_KEY);
    } catch {
      seen = null;
    }
    if (!debug && (seen || reduced)) {
      window.setTimeout(announce, 0);
      return;
    }
    if (rawFreeze !== null) {
      const v = Number(rawFreeze);
      if (Number.isFinite(v) && v >= 0) setFreezeMs(v);
    }
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* 隐私模式下忽略 */
    }
    setPhase("playing");
  }, [announce]);

  /* 跳过：点击 / ESC / 空格 */
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, finish]);

  /* 绘制 */
  useEffect(() => {
    if (phase !== "playing" || mode !== "carve") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    return runCarveIntro(canvas, wrapRef.current, { onDone: finish, freezeMs });
  }, [phase, mode, finish, freezeMs]);

  if (mode === "video") return <IntroOverlay />;
  if (phase === "hidden") return null;

  return (
    <div
      ref={wrapRef}
      aria-hidden
      onClick={finish}
      className={`fixed inset-0 z-[200] cursor-pointer overflow-hidden transition-opacity duration-[340ms] ${
        phase === "leaving" ? "opacity-0" : "opacity-100"
      }`}
      style={{ backgroundColor: "#08111a" }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-6 right-6 select-none text-[11px] tracking-[0.22em] text-white/30">
        点击跳过 · SKIP
      </div>
    </div>
  );
}
