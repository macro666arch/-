"use client";

import { useEffect, useRef } from "react";

type ParticleFieldProps = {
  /** 每 12000px² 一个粒子 */
  density?: number;
  /** 粒子颜色池（rgba 前缀，透明度运行时附加） */
  palette?: string[];
  /** 粒子连线最大距离 */
  linkDistance?: number;
  /** 鼠标拖尾与点击爆发 */
  interactive?: boolean;
  /** 粒子基础不透明度 0-1 */
  alpha?: number;
  className?: string;
};

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number; // -1 表示常驻
  maxLife: number;
};

/**
 * 轻量粒子网络：漂浮粒子 + 近距连线 + 鼠标拖尾 + 点击爆发。
 * 监听 window 事件，宿主元素 pointer-events-none 也能工作。
 * prefers-reduced-motion 下不渲染；页面隐藏时暂停；移动端自动降密度。
 */
export default function ParticleField({
  density = 14000,
  palette = ["159,176,196", "111,137,166", "226,232,240"],
  linkDistance = 110,
  interactive = true,
  alpha = 0.75,
  className,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    let particles: P[] = [];
    const mouse = { x: -9999, y: -9999, px: -9999, py: -9999 };
    const paletteRgb = palette;

    function resize() {
      const rect = parent.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      const target = Math.min(
        isCoarse ? 46 : 96,
        Math.max(18, Math.floor((w * h) / density)),
      );
      particles = [];
      for (let i = 0; i < target; i++) particles.push(spawn(true));
    }

    function spawn(anywhere = false, x?: number, y?: number, burst = false): P {
      const speed = burst ? 2.6 : 0.22;
      const angle = Math.random() * Math.PI * 2;
      const mag = (0.25 + Math.random() * 0.75) * speed;
      return {
        x: x ?? Math.random() * w,
        y: y ?? Math.random() * h,
        vx: Math.cos(angle) * mag,
        vy: Math.sin(angle) * mag,
        r: burst ? 1 + Math.random() * 2.2 : 1.0 + Math.random() * 2.2,
        color: paletteRgb[Math.floor(Math.random() * paletteRgb.length)],
        life: burst ? 0 : -1,
        maxLife: burst ? 50 + Math.random() * 40 : 0,
        ...(anywhere ? {} : {}),
      };
    }

    function toLocal(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top, inside: clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom };
    }

    function onMove(e: PointerEvent) {
      const p = toLocal(e.clientX, e.clientY);
      mouse.px = mouse.x;
      mouse.py = mouse.y;
      mouse.x = p.inside ? p.x : -9999;
      mouse.y = p.inside ? p.y : -9999;
      if (!interactive || !p.inside) return;
      // 拖尾：移动距离足够时在轨迹上撒粒子
      const dx = mouse.x - mouse.px;
      const dy = mouse.y - mouse.py;
      const dist = Math.hypot(dx, dy);
      if (dist > 14 && particles.length < (isCoarse ? 90 : 220)) {
        const steps = Math.min(3, Math.floor(dist / 14));
        for (let i = 0; i < steps; i++) {
          const t = i / steps;
          const tr = spawn(false, mouse.px + dx * t, mouse.py + dy * t, true);
          tr.vx *= 0.3;
          tr.vy *= 0.3;
          tr.maxLife = 34 + Math.random() * 26;
          tr.r = 0.5 + Math.random() * 1.1;
          particles.push(tr);
        }
      }
    }

    function onDown(e: PointerEvent) {
      if (!interactive) return;
      const p = toLocal(e.clientX, e.clientY);
      if (!p.inside) return;
      // 点击爆发：径向粒子环
      const n = isCoarse ? 14 : 26;
      for (let i = 0; i < n; i++) {
        const b = spawn(false, p.x, p.y, true);
        const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        const sp = 1.4 + Math.random() * 2.6;
        b.vx = Math.cos(angle) * sp;
        b.vy = Math.sin(angle) * sp;
        particles.push(b);
      }
      if (particles.length > (isCoarse ? 140 : 320)) {
        particles.splice(0, particles.length - (isCoarse ? 140 : 320));
      }
    }

    function frame() {
      if (!running) return;
      ctx!.clearRect(0, 0, w, h);

      // 常驻粒子漂移 + 鼠标引力
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        if (pt.life >= 0) {
          pt.life++;
          pt.vx *= 0.96;
          pt.vy *= 0.96;
          pt.vy += 0.012; // 微弱上浮
          if (pt.life > pt.maxLife) {
            particles.splice(i, 1);
            continue;
          }
        } else if (interactive && mouse.x > -999) {
          const dx = mouse.x - pt.x;
          const dy = mouse.y - pt.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 22000 && d2 > 900) {
            pt.vx += (dx / Math.sqrt(d2)) * 0.012;
            pt.vy += (dy / Math.sqrt(d2)) * 0.012;
          }
        }
        pt.x += pt.vx;
        pt.y += pt.vy;
        if (pt.life < 0) {
          // 常驻粒子限速与边界回绕
          pt.vx = Math.max(-0.35, Math.min(0.35, pt.vx));
          pt.vy = Math.max(-0.35, Math.min(0.35, pt.vy));
          if (pt.x < -20) pt.x = w + 20;
          if (pt.x > w + 20) pt.x = -20;
          if (pt.y < -20) pt.y = h + 20;
          if (pt.y > h + 20) pt.y = -20;
        }
      }

      // 连线（仅常驻粒子之间，限制扫描数量防爆）
      const linkBase = particles.filter((p) => p.life < 0);
      const scan = linkBase.slice(0, isCoarse ? 40 : 80);
      ctx!.lineWidth = 0.6;
      for (let i = 0; i < scan.length; i++) {
        for (let j = i + 1; j < scan.length; j++) {
          const dx = scan[i].x - scan[j].x;
          const dy = scan[i].y - scan[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < linkDistance * linkDistance) {
            const o = (1 - Math.sqrt(d2) / linkDistance) * 0.28 * alpha;
            ctx!.strokeStyle = `rgba(${scan[i].color},${o.toFixed(3)})`;
            ctx!.beginPath();
            ctx!.moveTo(scan[i].x, scan[i].y);
            ctx!.lineTo(scan[j].x, scan[j].y);
            ctx!.stroke();
          }
        }
      }

      // 粒子本体
      for (const pt of particles) {
        const fade =
          pt.life >= 0 ? Math.max(0, 1 - pt.life / pt.maxLife) : 1;
        const o = alpha * fade;
        ctx!.fillStyle = `rgba(${pt.color},${o.toFixed(3)})`;
        ctx!.beginPath();
        ctx!.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      raf = requestAnimationFrame(frame);
    }

    function onVisibility() {
      running = document.visibilityState === "visible";
      if (running) raf = requestAnimationFrame(frame);
      else cancelAnimationFrame(raf);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    resize();
    frame();

    if (interactive) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (interactive) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerdown", onDown);
      }
    };
  }, [density, palette, linkDistance, interactive, alpha]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className ?? ""}`}
    />
  );
}
