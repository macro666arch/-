/**
 * 刻线开场 · 绘制引擎（纯 Canvas 2D，无 React 依赖）
 *
 * 叙事：深墨空场里一道光刃从左侧掠入，沿一条缓曲线刻行；
 *       刻痕头部白热、身后渐冷（白热 → 金 → 琥珀 → 余烬 → 冷灰），
 *       刃口两侧留下刻蚀排线，火花沿切线抛射；
 *       刻行结束后，起伏的刻痕被拉直成一条水平光缝，
 *       光缝向上下张开，露出纸白页面 —— 完成暗场到站点的交接。
 *
 * 由 IntroCarve.tsx 调用；也可脱离 React 单独运行（便于逐帧审看）。
 */

export type RGB = [number, number, number];

/* ── 时间轴（ms，均相对动画起点） ───────────────────────────── */
export const T_CARVE_START = 260;
export const T_CARVE_END = 3420;
export const T_SETTLE_START = 3350;
export const T_SETTLE_END = 4180;
export const T_OPEN_START = 4120;
export const T_OPEN_END = 5120;
export const T_DONE = 5240;

export const INK: RGB = [8, 17, 26];
export const PAPER: RGB = [246, 244, 238];
const HEAD_C: RGB = [255, 251, 240];
const GOLD: RGB = [255, 189, 104];
const AMBER: RGB = [203, 120, 46];
const EMBER: RGB = [95, 56, 32];
const ASH: RGB = [46, 60, 76];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => v * v * (3 - 2 * v);
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const rgba = (c: RGB, a: number) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a < 0 ? 0 : a > 1 ? 1 : a})`;

/** 刻痕按“年龄”冷却：白热 → 金 → 琥珀 → 余烬 → 冷灰 */
function trailColor(age: number): [RGB, number] {
  if (age < 90) return [HEAD_C, 1];
  if (age < 430) {
    const t = (age - 90) / 340;
    return [mix(HEAD_C, GOLD, t), 1 - 0.07 * t];
  }
  if (age < 1320) {
    const t = (age - 430) / 890;
    return [mix(GOLD, AMBER, 1 - Math.pow(1 - t, 2)), 0.93 - 0.3 * t];
  }
  if (age < 2600) {
    const t = (age - 1320) / 1280;
    return [mix(AMBER, EMBER, t), 0.63 - 0.21 * t];
  }
  const t = Math.min(1, (age - 2600) / 1700);
  return [mix(EMBER, ASH, t), 0.42 - 0.17 * t];
}

/* 主刻痕控制点（归一化坐标，x 略超出画框两端） */
const CTRL: [number, number][] = [
  [-0.10, 0.655],
  [0.09, 0.715],
  [0.235, 0.515],
  [0.355, 0.575],
  [0.495, 0.395],
  [0.615, 0.455],
  [0.735, 0.325],
  [0.875, 0.405],
  [1.10, 0.295],
];

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export type CarveOptions = {
  /** 动画播完回调 */
  onDone?: () => void;
  /** 只画该时刻一帧并停住（逐帧审看用）；不传则正常播放 */
  freezeMs?: number;
};

/**
 * 在给定 canvas 上跑一次刻线开场。
 * 返回清理函数（取消 rAF、移除 resize 监听）。
 */
export function runCarveIntro(
  canvas: HTMLCanvasElement,
  wrap: HTMLElement | null,
  opts: CarveOptions = {}
): () => void {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return () => {};

  const FREEZE = typeof opts.freezeMs === "number" && opts.freezeMs >= 0 ? opts.freezeMs : -1;
  let raf = 0;
  let W = 0;
  let H = 0;
  let dpr = 1;
  const t0 = performance.now();
  let done = false;

  /* ── 几何：主刻痕采样 + 排线 ──────────────────────────── */
  const N = 460;
  const bx = new Float32Array(N);
  const by = new Float32Array(N);
  const sx = new Float32Array(N);
  const sy = new Float32Array(N);
  const tanx = new Float32Array(N);
  const tany = new Float32Array(N);
  const nrmx = new Float32Array(N);
  const nrmy = new Float32Array(N);
  const birth = new Float32Array(N);
  let hatches: { i: number; off: number; len: number; skew: number }[] = [];

  const buildPath = () => {
    const seg = CTRL.length - 1;
    const per = Math.max(24, Math.floor(N / seg));
    let k = 0;
    for (let s = 0; s < seg && k < N; s++) {
      const p0 = CTRL[Math.max(0, s - 1)];
      const p1 = CTRL[s];
      const p2 = CTRL[s + 1];
      const p3 = CTRL[Math.min(seg, s + 2)];
      const steps = s === seg - 1 ? N - k : per;
      for (let j = 0; j < steps && k < N; j++) {
        const t = j / steps;
        bx[k] = catmull(p0[0], p1[0], p2[0], p3[0], t) * W;
        by[k] = catmull(p0[1], p1[1], p2[1], p3[1], t) * H;
        k++;
      }
    }
    for (let i = N - 1; i >= 0; i--) {
      if (!Number.isFinite(bx[i]) || !Number.isFinite(by[i])) {
        bx[i] = i > 0 ? bx[i - 1] : 0;
        by[i] = i > 0 ? by[i - 1] : H * 0.5;
      }
    }
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(N - 1, i + 1);
      const dx = bx[b] - bx[a];
      const dy = by[b] - by[a];
      const L = Math.hypot(dx, dy) || 1;
      tanx[i] = dx / L;
      tany[i] = dy / L;
      nrmx[i] = -tany[i];
      nrmy[i] = tanx[i];
      birth[i] = T_CARVE_START + (i / (N - 1)) * (T_CARVE_END - T_CARVE_START);
    }
    /* 刻蚀排线：只在刃口附近存活（像崩出的细屑），短、淡、带随机倾角 */
    hatches = [];
    const step = Math.max(6, Math.round(N / 110));
    for (let i = 4; i < N - 2; i += step) {
      for (let r = 0; r < 2; r++) {
        if (Math.random() < 0.35) continue;
        hatches.push({
          i,
          off: (r === 0 ? -1 : 1) * (2.5 + Math.random() * 7),
          len: 2.5 + Math.random() * 6,
          skew: 0.35 + Math.random() * 0.9,
        });
      }
    }
  };

  /* ── 尘粒 ─────────────────────────────────────────────── */
  let dust: { x: number; y: number; r: number; a: number; ph: number; sp: number }[] = [];
  const buildDust = () => {
    const count = W < 760 ? 90 : 170;
    dust = [];
    for (let i = 0; i < count; i++) {
      dust.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.5 + Math.random() * 1.7,
        a: 0.05 + Math.random() * 0.28,
        ph: Math.random() * Math.PI * 2,
        sp: 0.12 + Math.random() * 0.5,
      });
    }
  };

  /* ── 火花 ─────────────────────────────────────────────── */
  const sparks: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    age: number;
    hot: number;
    w: number;
  }[] = [];

  /* ── 颗粒（静态噪点，铺在暗场上消除 banding） ──────────── */
  const grainSize = 128;
  const grainCanvas = document.createElement("canvas");
  grainCanvas.width = grainSize;
  grainCanvas.height = grainSize;
  const gctx = grainCanvas.getContext("2d");
  if (gctx) {
    const img = gctx.createImageData(grainSize, grainSize);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 190;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 40;
    }
    gctx.putImageData(img, 0, 0);
  }
  const grain = ctx.createPattern(grainCanvas, "repeat");

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildPath();
    buildDust();
  };
  resize();
  window.addEventListener("resize", resize);

  /* 预跑：freeze 模式下先把粒子状态推进到目标时刻，保证画面与实时一致 */
  const warm = () => {
    if (FREEZE < 0) return;
    for (let t = 0; t < FREEZE; t += 16.67) {
      const p = clamp01((t - T_CARVE_START) / (T_CARVE_END - T_CARVE_START));
      if (p <= 0 || p >= 0.995) continue;
      const hi = Math.min(N - 1, Math.max(0, Math.floor(p * (N - 1))));
      const n = Math.min(9, Math.round(4 + Math.random() * 6));
      for (let k = 0; k < n; k++) {
        const sp = 60 + Math.random() * 300;
        const side = (Math.random() - 0.5) * 200;
        sparks.push({
          x: bx[hi],
          y: by[hi],
          vx: tanx[hi] * sp + nrmx[hi] * side,
          vy: tany[hi] * sp + nrmy[hi] * side - 30,
          life: 0.42 + Math.random() * 0.72,
          age: 0,
          hot: Math.random(),
          w: 0.8 + Math.random() * 1.1,
        });
      }
      const dt = 1 / 60;
      for (let k = sparks.length - 1; k >= 0; k--) {
        const s = sparks[k];
        s.age += dt;
        if (s.age > s.life) {
          sparks.splice(k, 1);
          continue;
        }
        s.vy += 150 * dt;
        s.vx *= 0.978;
        s.vy *= 0.982;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
    }
  };
  warm();

  /* ── 单帧绘制 ─────────────────────────────────────────── */
  const frame = (now: number) => {
    const e = FREEZE >= 0 ? FREEZE : now - t0;
    const cy = H * 0.5;

    const p = clamp01((e - T_CARVE_START) / (T_CARVE_END - T_CARVE_START));
    const settle = smooth(clamp01((e - T_SETTLE_START) / (T_SETTLE_END - T_SETTLE_START)));
    const openK = clamp01((e - T_OPEN_START) / (T_OPEN_END - T_OPEN_START));
    const intro = smooth(clamp01(e / 460));
    const fadeIn = clamp01(e / 380);

    /* 拉直：起伏的刻痕收束成水平光缝 */
    const amp = 1 - settle;
    for (let i = 0; i < N; i++) {
      sx[i] = bx[i];
      sy[i] = cy + (by[i] - cy) * amp;
    }

    const hi = Math.min(N - 1, Math.max(0, Math.floor(p * (N - 1))));
    const headX = sx[hi];
    const headY = sy[hi];

    /* 1. 底色 */
    const bg = ctx.createLinearGradient(0, 0, W * 0.35, H);
    bg.addColorStop(0, rgba([10, 20, 30], 1));
    bg.addColorStop(0.42, rgba(INK, 1));
    bg.addColorStop(0.78, rgba([7, 15, 22], 1));
    bg.addColorStop(1, rgba([4, 9, 14], 1));
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* 2. 环境辉光（冷底 + 随刃口移动的暖池） */
    ctx.globalCompositeOperation = "lighter";
    const ambA = 0.9 * intro;
    const a1 = ctx.createRadialGradient(W * 0.66, H * 0.26, 0, W * 0.66, H * 0.26, Math.max(W, H) * 0.8);
    a1.addColorStop(0, rgba([46, 74, 106], 0.28 * ambA));
    a1.addColorStop(0.5, rgba([16, 32, 48], 0.16 * ambA));
    a1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = a1;
    ctx.fillRect(0, 0, W, H);

    const a2 = ctx.createRadialGradient(W * 0.18, H * 0.82, 0, W * 0.18, H * 0.82, Math.max(W, H) * 0.55);
    a2.addColorStop(0, rgba([20, 34, 52], 0.2 * ambA));
    a2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = a2;
    ctx.fillRect(0, 0, W, H);

    if (p > 0 && p < 1) {
      const heat = ctx.createRadialGradient(headX, headY, 0, headX, headY, Math.max(W, H) * 0.34);
      heat.addColorStop(0, rgba(GOLD, 0.16 * fadeIn));
      heat.addColorStop(0.35, rgba(AMBER, 0.07 * fadeIn));
      heat.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = heat;
      ctx.fillRect(0, 0, W, H);
    }

    /* 3. 尘粒 */
    const tt = (e - T_CARVE_START) / 1000;
    for (let i = 0; i < dust.length; i++) {
      const d = dust[i];
      const dx = d.x * W + Math.sin(tt * d.sp + d.ph) * 9;
      const dy = d.y * H - tt * d.sp * 5;
      const yy = ((dy % H) + H) % H;
      ctx.fillStyle = rgba([188, 210, 232], d.a * intro * (0.5 + 0.5 * Math.sin(tt * 1.4 + d.ph)));
      ctx.beginPath();
      ctx.arc(dx, yy, d.r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 4. 刻痕本体：按“年龄”分桶，一次描出整段 */
    const NB = 34;
    const BUCKET = 150;
    const buckets: (Path2D | null)[] = new Array(NB).fill(null);
    for (let i = 0; i < hi; i++) {
      const age = e - birth[i];
      if (age < 0) continue;
      const b = Math.min(NB - 1, Math.floor(age / BUCKET));
      let pth = buckets[b];
      if (!pth) {
        pth = new Path2D();
        pth.moveTo(sx[i], sy[i]);
        buckets[b] = pth;
      }
      pth.lineTo(sx[i + 1], sy[i + 1]);
    }
    const passes: { w: number; a: number; white?: number }[] = [
      { w: 30, a: 0.03 },
      { w: 11, a: 0.075 },
      { w: 3.4, a: 0.42 },
      { w: 1.3, a: 1.0, white: 0.45 },
    ];
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let b = 0; b < NB; b++) {
      const pth = buckets[b];
      if (!pth) continue;
      const age = b * BUCKET + BUCKET * 0.5;
      const [col, alpha] = trailColor(age);
      const boost = 1 + 0.55 * settle;
      for (let k = 0; k < passes.length; k++) {
        const ps = passes[k];
        const c = ps.white ? mix(col, HEAD_C, ps.white * (1 - Math.min(1, age / 2200))) : col;
        ctx.strokeStyle = rgba(c, alpha * ps.a * boost);
        ctx.lineWidth = ps.w;
        ctx.stroke(pth);
      }
    }

    /* 5. 刻蚀排线（短屑，只随刃口存活约 1.2s，随后只留干净刻痕） */
    for (let k = 0; k < hatches.length; k++) {
      const h = hatches[k];
      const age = e - birth[h.i];
      if (age < 30) continue;
      const i = h.i;
      if (sx[i] > W - 14) continue;
      const px = sx[i] + nrmx[i] * h.off;
      const py = sy[i] + nrmy[i] * h.off;
      const dir = h.off > 0 ? 1 : -1;
      const ex = px + nrmx[i] * h.len + tanx[i] * h.len * h.skew * dir * 0.5;
      const ey = py + nrmy[i] * h.len + tany[i] * h.len * h.skew * dir * 0.5;
      const a = Math.max(0, 1 - age / 1200) * 0.3;
      if (a <= 0.004) continue;
      const col = mix([214, 232, 244], GOLD, Math.min(1, 700 / (age + 260)) * 0.5);
      ctx.strokeStyle = rgba(col, a);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    /* 6. 火花：抛射 + 拖影 */
    if (p > 0 && p < 0.995) {
      const n = Math.min(9, Math.round(4 + Math.random() * 6));
      for (let k = 0; k < n; k++) {
        const sp = 60 + Math.random() * 300;
        const side = (Math.random() - 0.5) * 200;
        sparks.push({
          x: headX + (Math.random() - 0.5) * 4,
          y: headY + (Math.random() - 0.5) * 4,
          vx: tanx[hi] * sp + nrmx[hi] * side,
          vy: tany[hi] * sp + nrmy[hi] * side - 30,
          life: 0.42 + Math.random() * 0.72,
          age: 0,
          hot: Math.random(),
          w: 0.8 + Math.random() * 1.1,
        });
      }
    }
    if (FREEZE < 0) {
      const dt = 1 / 60;
      for (let k = sparks.length - 1; k >= 0; k--) {
        const s = sparks[k];
        s.age += dt;
        if (s.age > s.life) {
          sparks.splice(k, 1);
          continue;
        }
        s.vy += 150 * dt;
        s.vx *= 0.978;
        s.vy *= 0.982;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
    }
    for (let k = 0; k < sparks.length; k++) {
      const s = sparks[k];
      const f = 1 - s.age / s.life;
      if (f <= 0) continue;
      const col = mix(GOLD, HEAD_C, s.hot);
      ctx.strokeStyle = rgba(col, 0.75 * f * f);
      ctx.lineWidth = s.w * (0.5 + f * 0.7);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.022, s.y - s.vy * 0.022);
      ctx.stroke();
    }

    /* 7. 刃口：白热核 + 沿切线的拉长光刺 */
    if (p > 0 && p < 1) {
      const g = ctx.createRadialGradient(headX, headY, 0, headX, headY, 74);
      g.addColorStop(0, rgba(HEAD_C, 0.95));
      g.addColorStop(0.18, rgba(GOLD, 0.55));
      g.addColorStop(0.55, rgba(AMBER, 0.16));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(headX, headY, 74, 0, Math.PI * 2);
      ctx.fill();

      const ang = Math.atan2(tany[hi], tanx[hi]);
      ctx.save();
      ctx.translate(headX, headY);
      ctx.rotate(ang);
      const sg = ctx.createLinearGradient(-120, 0, 34, 0);
      sg.addColorStop(0, "rgba(255,190,120,0)");
      sg.addColorStop(0.75, rgba(GOLD, 0.5));
      sg.addColorStop(1, rgba(HEAD_C, 0.95));
      ctx.strokeStyle = sg;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-120, 0);
      ctx.lineTo(26, 0);
      ctx.stroke();
      ctx.restore();
    }

    /* 8. 颗粒 + 暗角 */
    ctx.globalCompositeOperation = "source-over";
    if (grain) {
      ctx.save();
      ctx.globalAlpha = 0.5 * fadeIn;
      ctx.translate((Math.random() * grainSize) | 0, (Math.random() * grainSize) | 0);
      ctx.fillStyle = grain;
      ctx.fillRect(-grainSize, -grainSize, W + grainSize * 2, H + grainSize * 2);
      ctx.restore();
    }
    const vg = ctx.createRadialGradient(
      W * 0.5,
      cy,
      Math.min(W, H) * 0.22,
      W * 0.5,
      cy,
      Math.max(W, H) * 0.82
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(0.62, "rgba(0,0,0,0.24)");
    vg.addColorStop(1, "rgba(0,0,0,0.68)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    /* 9. 光缝张开，露出纸白页面 */
    if (openK > 0) {
      const k = 1 - Math.pow(1 - openK, 3);
      if (openK > 0.72 && wrap) {
        wrap.style.backgroundColor = rgba(PAPER, 1);
      }
      const half = k * (cy + 80);
      const pad = 72;
      const y0 = cy - half - pad;
      const y1 = cy + half + pad;
      const pg = ctx.createLinearGradient(0, y0, 0, y1);
      const stop = pad / Math.max(1, y1 - y0);
      pg.addColorStop(0, rgba(PAPER, 0));
      pg.addColorStop(Math.min(0.49, stop), rgba(PAPER, 1));
      pg.addColorStop(Math.max(0.51, 1 - stop), rgba(PAPER, 1));
      pg.addColorStop(1, rgba(PAPER, 0));
      ctx.fillStyle = pg;
      ctx.fillRect(0, y0, W, y1 - y0);
      if (half > cy + 40) {
        ctx.fillStyle = rgba(PAPER, 1);
        ctx.fillRect(0, 0, W, H);
      }

      /* 缝口的暖光辉（随张开衰减；白而不刺） */
      ctx.globalCompositeOperation = "lighter";
      const seamA = (1 - openK) * 0.9;
      for (let s = 0; s < 2; s++) {
        const ySeam = s === 0 ? cy - half : cy + half;
        if (ySeam < -60 || ySeam > H + 60) continue;
        const lg = ctx.createLinearGradient(0, ySeam - 20, 0, ySeam + 20);
        lg.addColorStop(0, "rgba(0,0,0,0)");
        lg.addColorStop(0.5, rgba(GOLD, 0.38 * seamA));
        lg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = lg;
        ctx.fillRect(0, ySeam - 20, W, 40);
        ctx.strokeStyle = rgba(HEAD_C, 0.42 * seamA);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, ySeam);
        ctx.lineTo(W, ySeam);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      /* 刻痕在纸面上留一道金线，随后熄灭 */
      const lineA = Math.max(0, 1 - clamp01((e - T_OPEN_START - 90) / 760)) * 0.85;
      if (lineA > 0.004) {
        ctx.strokeStyle = rgba([183, 128, 46], lineA);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(W, cy);
        ctx.stroke();
      }
    }

    if (FREEZE >= 0) return;
    if (e >= T_DONE) {
      if (!done) {
        done = true;
        opts.onDone?.();
      }
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  /* 首帧同步绘制，避免 canvas 空白时页面闪一下 */
  frame(t0 + 1);
  if (FREEZE < 0) raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  };
}
