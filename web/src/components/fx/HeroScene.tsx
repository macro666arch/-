"use client";

import { useEffect, useRef } from "react";

/**
 * 首页 Hero 的 Three.js 场景：
 * - 星点云（墨蓝/青/紫，加色混合）缓慢旋转，像信息星图
 * - 中央线框二十面体呼吸浮动
 * - 鼠标视差驱动相机，触屏退化为陀螺静态微旋
 * - 透明底叠在海报图上；reduced-motion 不渲染；隐藏时暂停
 */
export default function HeroScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    // 异步引入 three，避免阻塞首屏
    void import("three").then((THREE) => {
      if (disposed || !mountRef.current) return;

      const isCoarse = window.matchMedia("(pointer: coarse)").matches;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      let w = mount.clientWidth;
      let h = mount.clientHeight;

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isCoarse,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100);
      camera.position.set(0, 0, 7.5);

      // ── 星点云：压扁的球壳分布 ─────────────────────────
      const COUNT = isCoarse ? 260 : 620;
      const positions = new Float32Array(COUNT * 3);
      const colors = new Float32Array(COUNT * 3);
      const cInk = new THREE.Color("#6f89a6");
      const cCyan = new THREE.Color("#67e8f9");
      const cViolet = new THREE.Color("#a78bfa");
      const cPaper = new THREE.Color("#e2e8f0");
      for (let i = 0; i < COUNT; i++) {
        const r = 2.6 + Math.random() * 3.4;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 1.5;
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.72;
        positions[i * 3 + 2] = r * Math.cos(phi) * 0.9;
        const pick = Math.random();
        const c = pick < 0.5 ? cInk : pick < 0.72 ? cPaper : pick < 0.88 ? cCyan : cViolet;
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      const pointsGeo = new THREE.BufferGeometry();
      pointsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      pointsGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const pointsMat = new THREE.PointsMaterial({
        size: 0.045,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(pointsGeo, pointsMat);
      scene.add(points);

      // ── 中央线框二十面体 ──────────────────────────────
      const icoGeo = new THREE.IcosahedronGeometry(1.55, 1);
      const icoMat = new THREE.MeshBasicMaterial({
        color: "#8fb4d9",
        wireframe: true,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ico = new THREE.Mesh(icoGeo, icoMat);
      ico.position.set(2.2, 0.35, 0);
      scene.add(ico);

      // 内核发光小球
      const coreGeo = new THREE.IcosahedronGeometry(0.5, 1);
      const coreMat = new THREE.MeshBasicMaterial({
        color: "#a78bfa",
        wireframe: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.copy(ico.position);
      scene.add(core);

      // ── 鼠标视差 ─────────────────────────────────────
      const target = { x: 0, y: 0 };
      const eased = { x: 0, y: 0 };
      function onMove(e: PointerEvent) {
        target.x = (e.clientX / window.innerWidth) * 2 - 1;
        target.y = (e.clientY / window.innerHeight) * 2 - 1;
      }
      window.addEventListener("pointermove", onMove, { passive: true });

      // ── 渲染循环（页面隐藏时暂停）────────────────────
      let raf = 0;
      let running = true;
      const startAt = performance.now();
      function tick() {
        if (!running) return;
        const t = (performance.now() - startAt) / 1000;
        points.rotation.y = t * 0.045;
        points.rotation.x = Math.sin(t * 0.11) * 0.06;
        ico.rotation.y = t * 0.18;
        ico.rotation.x = t * 0.09;
        core.rotation.y = -t * 0.3;
        const breathe = 1 + Math.sin(t * 0.8) * 0.05;
        ico.scale.setScalar(breathe);
        eased.x += (target.x - eased.x) * 0.045;
        eased.y += (target.y - eased.y) * 0.045;
        camera.position.x = eased.x * 0.9;
        camera.position.y = -eased.y * 0.55;
        camera.lookAt(1.1, 0.2, 0);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      }
      tick();

      function onVisibility() {
        running = document.visibilityState === "visible";
        if (running) {
          raf = requestAnimationFrame(tick);
        } else {
          cancelAnimationFrame(raf);
        }
      }
      document.addEventListener("visibilitychange", onVisibility);

      const ro = new ResizeObserver(() => {
        w = mount.clientWidth;
        h = mount.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      ro.observe(mount);

      cleanup = () => {
        running = false;
        cancelAnimationFrame(raf);
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pointermove", onMove);
        pointsGeo.dispose();
        pointsMat.dispose();
        icoGeo.dispose();
        icoMat.dispose();
        coreGeo.dispose();
        coreMat.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 [&>canvas]:h-full [&>canvas]:w-full"
    />
  );
}
