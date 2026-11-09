"use client";

/**
 * 流动光束：几条柔边光带斜向缓慢扫过，叠加青色/紫色全息光晕。
 * 纯 CSS 实现。variant="dark"（默认）用 screen 混合适合深色 Hero；
 * variant="light" 用 normal 混合 + 高饱和色，适合浅色纸面背景。
 * reduced-motion 下静止。
 */
export default function AuroraBeams({
  className,
  variant = "dark",
}: {
  className?: string;
  variant?: "dark" | "light";
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${
        variant === "light" ? "aurora-light" : ""
      } ${className ?? ""}`}
    >
      {/* 主光束：青蓝 */}
      <div className="aurora-beam aurora-beam-a" />
      {/* 副光束：紫 */}
      <div className="aurora-beam aurora-beam-b" />
      {/* 全息光晕团 */}
      <div className="aurora-blob aurora-blob-a" />
      <div className="aurora-blob aurora-blob-b" />
    </div>
  );
}
