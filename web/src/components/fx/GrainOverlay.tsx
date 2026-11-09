"use client";

/**
 * 胶片颗粒噪点：SVG feTurbulence 生成，steps 跳帧制造颗粒闪烁。
 * 仅装饰，pointer-events-none；reduced-motion 下静止。
 */
export default function GrainOverlay({
  opacity = 0.05,
  zIndex = 40,
  blend = "overlay",
}: {
  opacity?: number;
  zIndex?: number;
  blend?: string;
}) {
  return (
    <div
      aria-hidden
      className="grain-overlay pointer-events-none fixed inset-0"
      style={{
        opacity,
        zIndex,
        mixBlendMode: blend as React.CSSProperties["mixBlendMode"],
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: "160px 160px",
      }}
    />
  );
}
