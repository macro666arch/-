"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * CG 开场容器：播放预渲染的离线 CG 视频（原片片段 + Blender Cycles 标题）。
 * 会话只播一次、点击跳过、reduced-motion 不播。
 * ?intro-debug 强制重播。
 * 结束时派发 cuc-intro-ended，让欢迎弹窗等后续 UI 与视频时长解耦。
 */
const VIDEO_SRC = "/intro/intro_final.mp4";
export const INTRO_ENDED_EVENT = "cuc-intro-ended";

export default function IntroOverlay() {
  const [phase, setPhase] = useState<"hidden" | "playing" | "leaving">("hidden");
  const videoRef = useRef<HTMLVideoElement>(null);
  const announced = useRef(false);

  const announce = useCallback(() => {
    if (announced.current) return;
    announced.current = true;
    window.dispatchEvent(new Event(INTRO_ENDED_EVENT));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const debug = params.has("intro-debug");
    const seen = sessionStorage.getItem("cuc-intro-seen");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!debug && (seen || reduced)) {
      // 下一个宏任务派发，确保其它组件已挂载并注册监听
      window.setTimeout(announce, 0);
      return;
    }
    sessionStorage.setItem("cuc-intro-seen", "1");
    setPhase("playing");
  }, [announce]);

  const finish = useCallback(() => {
    if (phase !== "playing") return;
    setPhase("leaving");
    window.setTimeout(() => {
      setPhase("hidden");
      announce();
    }, 600);
  }, [phase, announce]);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden
      onClick={finish}
      className={`fixed inset-0 z-[200] cursor-pointer overflow-hidden bg-black transition-opacity duration-500 ${
        phase === "leaving" ? "opacity-0" : "opacity-100"
      }`}
    >
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        autoPlay
        muted
        playsInline
        onEnded={finish}
        onError={finish}
        className="h-full w-full object-cover"
      />
      {/* 跳过提示 */}
      <div className="absolute bottom-6 right-6 text-xs text-white/40 tracking-widest pointer-events-none select-none">
        点击跳过 · SKIP
      </div>
    </div>
  );
}
