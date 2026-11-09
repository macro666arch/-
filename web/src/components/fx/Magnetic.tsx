"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * 磁吸容器：悬停时内容向光标方向吸附，离开后弹性回位。
 * 触屏与 reduced-motion 下不生效（退化为普通元素）。
 */
export default function Magnetic({
  children,
  strength = 0.32,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useRef(false);

  useEffect(() => {
    enabled.current =
      !window.matchMedia("(pointer: coarse)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  function onMove(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || !enabled.current) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    gsap.to(el, { x: x * strength, y: y * strength, duration: 0.35, ease: "power3.out" });
  }

  function onLeave() {
    const el = ref.current;
    if (!el || !enabled.current) return;
    gsap.to(el, { x: 0, y: 0, duration: 0.75, ease: "elastic.out(1, 0.38)" });
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`inline-block ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
