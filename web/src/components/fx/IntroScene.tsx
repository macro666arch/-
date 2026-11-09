"use client";

import { useEffect, useRef } from "react";

/**
 * 电影级 CG 开场（Three.js + 后期辉光 + 色散/颗粒/暗角）
 *
 * 八幕一镜到底，尺度逐级收敛（宇宙 → 地表 → 城市 → 玻璃球 → 泡膜 → 光核）：
 *  A1 0.0–4.2   深空星云：实拍星云底片 + 星尘 + 神光 + 镜头光晕
 *  A2 3.9–7.6   俯冲入大气：体积云团掠过、雪山远景、丁达尔光柱
 *  A3 7.3–11.9  峡谷低空掠行：层叠砂岩台地视差、扬尘、金色环形飞行器
 *  A4 11.8–17.4 黄昏霓虹都市：程序化玻璃塔群、湿地面镜像、逆光太阳横纹光晕
 *  A5 17.0–21.8 拉远揭示：城市缩小收进水晶球，暖木收藏室、焦散光斑、球内烟雾
 *  A6 21.6–24.3 薄膜虹彩 + 破裂：薄膜干涉虹彩球面、液滴爆散
 *  A7 24.0–27.2 曲速光隧道 + 棱镜色散放射光束
 *  A8 26.6–30.0 光核收拢，DOM 标题层浮现
 *
 * 所有状态均由时间 t 的纯函数计算；支持 startAt 跳秒与 freezeAt 定格调试。
 * 参考片技法全部落到实时实现：逆光大气分层、宽银幕横向光晕、湿面反射、
 * 玻璃体折射/薄膜干涉、泡破裂粒子、棱镜色散、胶片颗粒与色差。
 */

type Props = {
  startAt?: number;
  /** 调试：定格在指定秒（时钟不前进，持续重渲染该时刻） */
  freezeAt?: number;
  onTitle?: () => void;
};

const T_TITLE = 26.9;

export default function IntroScene({ startAt = 0, freezeAt, onTitle }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const titleFired = useRef(false);
  const onTitleRef = useRef(onTitle);
  onTitleRef.current = onTitle;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    Promise.all([
      import("three"),
      import("three/examples/jsm/postprocessing/EffectComposer.js"),
      import("three/examples/jsm/postprocessing/RenderPass.js"),
      import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
      import("three/examples/jsm/postprocessing/OutputPass.js"),
      import("three/examples/jsm/postprocessing/ShaderPass.js"),
      import("three/examples/jsm/environments/RoomEnvironment.js"),
    ]).then(
      ([THREE, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }, { RoomEnvironment }]) => {
        if (disposed || !mountRef.current) return;

        const isCoarse = window.matchMedia("(pointer: coarse)").matches;
        const dpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.2 : 1.6);
        let w = mount.clientWidth;
        let h = mount.clientHeight;

        const renderer = new THREE.WebGLRenderer({ antialias: !isCoarse, powerPreference: "high-performance" });
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h);
        renderer.setClearColor(0x03040c, 1);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.94;
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 900);
        camera.position.set(0, 0, 34);

        // 环境反射：玻璃、湿地面、金属的质感来源
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envRT = pmrem.fromScene(new RoomEnvironment(), 0.05);
        scene.environment = envRT.texture;

        const fog = new THREE.FogExp2(0x060a1c, 0.0042);
        scene.fog = fog;

        // ── 后期链：辉光 → 色差/颗粒/暗角 ─────────────────
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.34, 0.55, 0.66);
        composer.addPass(bloom);
        composer.addPass(new OutputPass());

        const grade = new ShaderPass({
          uniforms: {
            tDiffuse: { value: null },
            uTime: { value: 0 },
            uGrain: { value: 0.045 },
            uVig: { value: 0.34 },
            uRes: { value: new THREE.Vector2(w, h) },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
          `,
          fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float uTime; uniform float uGrain; uniform float uVig; uniform vec2 uRes;
            varying vec2 vUv;
            void main() {
              vec2 c = vUv - 0.5;
              float r2 = dot(c, c);
              float ca = 0.0022 * r2 + 0.0004;
              vec3 col;
              col.r = texture2D(tDiffuse, vUv + c * ca).r;
              col.g = texture2D(tDiffuse, vUv).g;
              col.b = texture2D(tDiffuse, vUv - c * ca).b;
              col *= 1.0 - uVig * r2 * 1.75;
              float n = fract(sin(dot(vUv * uRes + uTime * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
              col += (n - 0.5) * uGrain;
              gl_FragColor = vec4(col, 1.0);
            }
          `,
        });
        composer.addPass(grade);

        // ── 数学工具 ─────────────────────────────────────
        const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
        const smooth = (a: number, b: number, x: number) => {
          const k = clamp01((x - a) / (b - a));
          return k * k * (3 - 2 * k);
        };
        const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
        const mulberry = (seed: number) => () => {
          seed |= 0;
          seed = (seed + 0x6d2b79f5) | 0;
          let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        // ── 程序贴图 ─────────────────────────────────────
        const texCanvas = (wpx: number, hpx: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
          const c = document.createElement("canvas");
          c.width = wpx;
          c.height = hpx;
          draw(c.getContext("2d")!);
          return new THREE.CanvasTexture(c);
        };

        // 柔光点
        const glowTex = texCanvas(128, 128, (ctx) => {
          const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
          g.addColorStop(0, "rgba(255,255,255,1)");
          g.addColorStop(0.22, "rgba(255,255,255,.72)");
          g.addColorStop(0.55, "rgba(255,255,255,.2)");
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 128, 128);
        });

        // 体积云团
        const cloudTex = texCanvas(512, 512, (ctx) => {
          for (let i = 0; i < 42; i++) {
            const x = 60 + Math.random() * 392;
            const y = 120 + Math.random() * 280;
            const r = 40 + Math.random() * 105;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, "rgba(255,255,255,.13)");
            g.addColorStop(0.55, "rgba(255,255,255,.06)");
            g.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 512, 512);
          }
        });

        // 建筑灯窗
        const windowTex = (seed: number) =>
          texCanvas(128, 256, (ctx) => {
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, 128, 256);
            let s = seed;
            const rnd = () => {
              s = (s * 16807) % 2147483647;
              return s / 2147483647;
            };
            for (let y = 4; y < 252; y += 6) {
              // 楼板暗带：让立面有横向分层，避免纯黑玻璃盒
              if (y % 24 < 6) {
                ctx.fillStyle = "rgba(40,58,84,.55)";
                ctx.fillRect(0, y - 1, 128, 1);
              }
              for (let x = 4; x < 124; x += 6) {
                if (rnd() < 0.42) {
                  const pick = rnd();
                  ctx.fillStyle =
                    pick < 0.55
                      ? "rgba(255,206,152,1)"
                      : pick < 0.8
                        ? "rgba(255,244,224,1)"
                        : pick < 0.92
                          ? "rgba(168,232,255,1)"
                          : "rgba(255,154,196,1)";
                  ctx.globalAlpha = 0.18 + rnd() * 0.72;
                  ctx.fillRect(x, y, 3, 3);
                }
              }
            }
            ctx.globalAlpha = 1;
            const tex = new THREE.CanvasTexture(ctx.canvas);
            tex.magFilter = THREE.LinearFilter;
            return tex;
          });

        // 竖向光柱（纵向衰减 + 横向羽化，避免出现硬边矩形）
        const beamTex = texCanvas(64, 256, (ctx) => {
          // 中性白光柱，颜色由各材质的 color 决定（星空冷白 / 火星暖橙 / 城市青蓝）
          const g = ctx.createLinearGradient(0, 0, 0, 256);
          g.addColorStop(0, "rgba(255,255,255,0)");
          g.addColorStop(0.12, "rgba(255,255,255,.95)");
          g.addColorStop(0.55, "rgba(255,255,255,.42)");
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 64, 256);
          const gx = ctx.createLinearGradient(0, 0, 64, 0);
          gx.addColorStop(0, "rgba(255,255,255,0)");
          gx.addColorStop(0.15, "rgba(255,255,255,.05)");
          gx.addColorStop(0.33, "rgba(255,255,255,.32)");
          gx.addColorStop(0.5, "rgba(255,255,255,1)");
          gx.addColorStop(0.67, "rgba(255,255,255,.32)");
          gx.addColorStop(0.85, "rgba(255,255,255,.05)");
          gx.addColorStop(1, "rgba(255,255,255,0)");
          ctx.globalCompositeOperation = "destination-in";
          ctx.fillStyle = gx;
          ctx.fillRect(0, 0, 64, 256);
          ctx.globalCompositeOperation = "source-over";
        });

        // 变形宽银幕横向光晕（anamorphic streak）
        const streakTex = texCanvas(512, 64, (ctx) => {
          const g = ctx.createRadialGradient(256, 32, 0, 256, 32, 256);
          g.addColorStop(0, "rgba(255,255,255,1)");
          g.addColorStop(0.18, "rgba(255,236,206,.9)");
          g.addColorStop(0.52, "rgba(255,190,140,.28)");
          g.addColorStop(1, "rgba(255,170,120,0)");
          ctx.save();
          ctx.translate(256, 32);
          ctx.scale(1, 0.16);
          ctx.translate(-256, -32);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 512, 64);
          ctx.restore();
        });

        // 棱镜色散放射光束（Boeing 式）
        const prismTex = texCanvas(512, 512, (ctx) => {
          ctx.translate(256, 256);
          const hues = [8, 32, 52, 170, 196, 262, 286, 320];
          for (let i = 0; i < hues.length; i++) {
            const a = (i / hues.length) * Math.PI * 2;
            const wdt = 0.055 + (i % 3) * 0.012;
            const grd = ctx.createRadialGradient(0, 0, 12, 0, 0, 250);
            grd.addColorStop(0, `hsla(${hues[i]},95%,72%,.85)`);
            grd.addColorStop(0.5, `hsla(${hues[i]},95%,62%,.24)`);
            grd.addColorStop(1, `hsla(${hues[i]},95%,56%,0)`);
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, 250, a - wdt, a + wdt);
            ctx.closePath();
            ctx.fill();
          }
        });

        // 层叠山脊剪影（视差层）
        const ridgeTex = (seed: number, light: string) =>
          texCanvas(1024, 320, (ctx) => {
            const rnd = mulberry(seed);
            ctx.clearRect(0, 0, 1024, 320);
            ctx.filter = "blur(4px)";
            for (let layer = 0; layer < 2; layer++) {
              const baseY = 150 + layer * 62;
              ctx.beginPath();
              ctx.moveTo(0, 320);
              let x = 0;
              let y = baseY;
              ctx.lineTo(0, y);
              while (x < 1024) {
                const step = 26 + rnd() * 62;
                x += step;
                y = baseY - Math.pow(rnd(), 2) * (96 - layer * 22) + rnd() * 18;
                ctx.lineTo(x, y);
              }
              ctx.lineTo(1024, 320);
              ctx.closePath();
              ctx.fillStyle = layer === 0 ? light : "rgba(26,18,14,.96)";
              ctx.fill();
            }
            ctx.filter = "none";
          });

        // 球体焦散光斑
        const causticTex = texCanvas(256, 256, (ctx) => {
          const g = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
          g.addColorStop(0, "rgba(255,214,150,.62)");
          g.addColorStop(0.42, "rgba(255,196,120,.28)");
          g.addColorStop(0.72, "rgba(255,170,96,.12)");
          g.addColorStop(1, "rgba(255,150,80,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(128, 128, 120, 86, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,236,190,.34)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(128, 128, 104, 72, 0, 0, Math.PI * 2);
          ctx.stroke();
        });

        // ── 实拍底片（从参考片中抽取的电影定帧）────────────
        const texLoader = new THREE.TextureLoader();
        const plate = (url: string, pw: number, ph: number, z: number, y = 0, fogOn = false) => {
          const tex = texLoader.load(url);
          tex.colorSpace = THREE.SRGBColorSpace;
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(pw, ph),
            new THREE.MeshBasicMaterial({
              map: tex,
              transparent: true,
              depthWrite: false,
              fog: fogOn,
            }),
          );
          mesh.position.set(0, y, z);
          return mesh;
        };

        // ══ A1 深空星云 ══════════════════════════════════
        const cosmicGrp = new THREE.Group();
        const cosmicBg = plate("/intro2/cosmic.jpg", 520, 292, -230, 10);
        const cosmicBgMat = cosmicBg.material as InstanceType<typeof THREE.MeshBasicMaterial>;
        cosmicGrp.add(cosmicBg);
        let stars!: InstanceType<typeof THREE.Points>;
        {
          const rnd = mulberry(9);
          const N = 2600;
          const geo = new THREE.BufferGeometry();
          const pos = new Float32Array(N * 3);
          const col = new Float32Array(N * 3);
          for (let i = 0; i < N; i++) {
            pos[i * 3] = (rnd() - 0.5) * 320;
            pos[i * 3 + 1] = (rnd() - 0.5) * 190;
            pos[i * 3 + 2] = 60 - rnd() * 300;
            const c = rnd() > 0.8 ? new THREE.Color("#ffb7f5") : rnd() > 0.55 ? new THREE.Color("#9db4ff") : new THREE.Color("#dcf4ff");
            col[i * 3] = c.r;
            col[i * 3 + 1] = c.g;
            col[i * 3 + 2] = c.b;
          }
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
          stars = new THREE.Points(
            geo,
            new THREE.PointsMaterial({
              size: 0.62,
              map: glowTex,
              vertexColors: true,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          cosmicGrp.add(stars);
        }

        // 丁达尔神光（三束）
        const godRays: InstanceType<typeof THREE.Mesh>[] = [];
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(
            new THREE.PlaneGeometry(58, 300),
            new THREE.MeshBasicMaterial({
              map: beamTex,
              color: 0xbfe6ff,
              transparent: true,
              opacity: 0.26,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              fog: false,
            }),
          );
          m.position.set(-46 + i * 40, -34, -150);
          m.rotation.z = -0.14 + i * 0.14;
          godRays.push(m);
          cosmicGrp.add(m);
        }

        // 星云核心 + 镜头光晕 + 横向光斑
        const cosmicSun = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTex, color: "#cfeeff", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
        );
        cosmicSun.position.set(22, 20, -190);
        cosmicSun.scale.set(64, 64, 1);
        cosmicGrp.add(cosmicSun);

        const cosmicStreak = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: streakTex, color: "#bfe6ff", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
        );
        cosmicStreak.position.copy(cosmicSun.position);
        cosmicStreak.scale.set(240, 30, 1);
        cosmicGrp.add(cosmicStreak);

        // 近景浮尘
        const dustNear = new THREE.Points(
          (() => {
            const rnd = mulberry(31);
            const N = 700;
            const g = new THREE.BufferGeometry();
            const p = new Float32Array(N * 3);
            for (let i = 0; i < N; i++) {
              p[i * 3] = (rnd() - 0.5) * 90;
              p[i * 3 + 1] = (rnd() - 0.5) * 60;
              p[i * 3 + 2] = 20 - rnd() * 120;
            }
            g.setAttribute("position", new THREE.BufferAttribute(p, 3));
            return g;
          })(),
          new THREE.PointsMaterial({ size: 0.22, map: glowTex, color: 0xbfe4ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        cosmicGrp.add(dustNear);
        scene.add(cosmicGrp);

        // ══ A2 大气 / 雪山 ══════════════════════════════
        const atmosGrp = new THREE.Group();
        const peaksBg = plate("/intro2/rocket.jpg", 520, 293, -170, -6);
        const peaksMat = peaksBg.material as InstanceType<typeof THREE.MeshBasicMaterial>;
        atmosGrp.add(peaksBg);

        const clouds: InstanceType<typeof THREE.Sprite>[] = [];
        {
          const rnd = mulberry(13);
          for (let i = 0; i < 46; i++) {
            const tex = new THREE.SpriteMaterial({
              map: cloudTex,
              color: i % 3 === 0 ? "#9a7f70" : "#b39a88",
              transparent: true,
              opacity: 0.06 + rnd() * 0.1,
              depthWrite: false,
              blending: THREE.NormalBlending,
            });
            const sp = new THREE.Sprite(tex);
            const ang = rnd() * Math.PI * 2;
            const r = 14 + rnd() * 40;
            sp.position.set(Math.cos(ang) * r, -14 + (rnd() - 0.5) * 44, 8 - rnd() * 90);
            const s = 30 + rnd() * 66;
            sp.scale.set(s, s * (0.45 + rnd() * 0.4), 1);
            clouds.push(sp);
            atmosGrp.add(sp);
          }
        }

        const beams: InstanceType<typeof THREE.Mesh>[] = [];
        for (let i = 0; i < 5; i++) {
          const m = new THREE.Mesh(
            new THREE.PlaneGeometry(6, 190),
            new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffca9c, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
          );
          m.position.set(-34 + i * 17, 30, -60 - i * 6);
          m.rotation.z = 0.12 - i * 0.05;
          beams.push(m);
          atmosGrp.add(m);
        }

        const atmosSun = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTex, color: "#ffe2b0", transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
        );
        atmosSun.position.set(-6, 26, -180);
        atmosSun.scale.set(70, 70, 1);
        atmosGrp.add(atmosSun);
        const atmosStreak = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: streakTex, color: "#ffd6a0", transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
        );
        atmosStreak.position.copy(atmosSun.position).add(new THREE.Vector3(0, -4, 6));
        atmosStreak.scale.set(260, 34, 1);
        atmosGrp.add(atmosStreak);
        scene.add(atmosGrp);

        // ══ A3 峡谷 ══════════════════════════════════════
        const canyonGrp = new THREE.Group();
        const canyonBg = plate("/intro2/canyon.jpg", 520, 213, -190, -4);
        const canyonMat = canyonBg.material as InstanceType<typeof THREE.MeshBasicMaterial>;
        canyonGrp.add(canyonBg);

        const ridgeFar = new THREE.Mesh(
          new THREE.PlaneGeometry(430, 134),
          new THREE.MeshBasicMaterial({ map: ridgeTex(3, "rgba(58,40,30,.75)"), transparent: true, depthWrite: false }),
        );
        ridgeFar.position.set(0, -32, -130);
        canyonGrp.add(ridgeFar);

        const ridgeNear = new THREE.Mesh(
          new THREE.PlaneGeometry(360, 96),
          new THREE.MeshBasicMaterial({ map: ridgeTex(17, "rgba(22,14,11,.92)"), transparent: true, depthWrite: false }),
        );
        ridgeNear.position.set(0, -40, -70);
        canyonGrp.add(ridgeNear);

        // 扬尘粒子
        const dustRnd = mulberry(41);
        const dustN = 900;
        const dustGeo = new THREE.BufferGeometry();
        const dustPos = new Float32Array(dustN * 3);
        const dustSeed = new Float32Array(dustN);
        for (let i = 0; i < dustN; i++) {
          dustPos[i * 3] = (dustRnd() - 0.5) * 180;
          dustPos[i * 3 + 1] = -20 + dustRnd() * 44;
          dustPos[i * 3 + 2] = 10 - dustRnd() * 120;
          dustSeed[i] = dustRnd();
        }
        dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
        const dust = new THREE.Points(
          dustGeo,
          new THREE.PointsMaterial({ size: 0.34, map: glowTex, color: 0xffd9a8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        canyonGrp.add(dust);

        // 金色环形飞行器（参考 Canyon 的环形灯载具）
        const craft = new THREE.Group();
        const craftBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.46, 1.5, 14),
          new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.42, metalness: 0.85, envMapIntensity: 0.9 }),
        );
        craftBody.rotation.z = Math.PI / 2;
        craft.add(craftBody);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.92, 0.09, 10, 44),
          new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: 0xffb347, emissiveIntensity: 2.4, roughness: 0.3, metalness: 0.7 }),
        );
        ring.rotation.x = Math.PI / 2; // 水平环，正对镜头呈碟形
        craft.add(ring);
        const ringGlow = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTex, color: "#ffbe5c", transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        ringGlow.scale.set(5.2, 5.2, 1);
        craft.add(ringGlow);
        const craftTrail = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTex, color: "#ffd9a0", transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        craftTrail.scale.set(9, 2.4, 1);
        craftTrail.position.x = -3.2;
        craft.add(craftTrail);
        craft.position.set(-16, 3, -34);
        canyonGrp.add(craft);
        scene.add(canyonGrp);

        // ══ A4 黄昏都市 ══════════════════════════════════
        const cityRig = new THREE.Group();
        const cityGrp = new THREE.Group();
        cityRig.add(cityGrp);
        // 夜幕天穹：程序化渐变 + 星点（比实拍底片更干净，也不会把标题字样带进画面）
        const skyTex = texCanvas(1024, 512, (ctx) => {
          const g = ctx.createLinearGradient(0, 0, 0, 512);
          g.addColorStop(0, "#050818");
          g.addColorStop(0.28, "#101a44");
          g.addColorStop(0.55, "#2c2a5e");
          g.addColorStop(0.78, "#6d4a60");
          g.addColorStop(0.92, "#c07b58");
          g.addColorStop(1, "#ffc48e");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 1024, 512);
          const rnd = mulberry(77);
          for (let i = 0; i < 460; i++) {
            const x = rnd() * 1024;
            const y = rnd() * 300;
            ctx.fillStyle = `rgba(214,232,255,${0.12 + rnd() * 0.42})`;
            ctx.beginPath();
            ctx.arc(x, y, 0.45 + rnd() * 0.85, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        const citySky = new THREE.Mesh(
          new THREE.PlaneGeometry(900, 300),
          new THREE.MeshBasicMaterial({ map: skyTex, transparent: true, depthWrite: false, fog: false }),
        );
        citySky.position.set(0, 130, -250);
        const citySkyMat = citySky.material as InstanceType<typeof THREE.MeshBasicMaterial>;
        cityGrp.add(citySky);

        const citySun = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTex, color: "#ffd39a", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
        );
        citySun.position.set(-42, 22, -215);
        citySun.scale.set(96, 96, 1);
        cityGrp.add(citySun);
        const cityStreak = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: streakTex, color: "#ffca8e", transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
        );
        cityStreak.position.copy(citySun.position).add(new THREE.Vector3(0, -8, 10));
        cityStreak.scale.set(360, 50, 1);
        cityGrp.add(cityStreak);

        // 楼群：三圈分布 + 中心地标
        const towerGeo = new THREE.BoxGeometry(1, 1, 1);
        // 顶/底面用素色，避免灯窗贴图糊到屋顶上
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x101722, roughness: 0.62, metalness: 0.35, envMapIntensity: 0.3 });
        const towerSide: InstanceType<typeof THREE.MeshStandardMaterial>[] = [];
        const towerMats = [1, 3, 6].map((seed) => {
          const s = new THREE.MeshStandardMaterial({
            color: 0x0a1220,
            roughness: 0.3,
            metalness: 0.68,
            envMapIntensity: 0.42,
            emissive: 0xffffff,
            emissiveMap: windowTex(seed),
            emissiveIntensity: 0.72,
          });
          towerSide.push(s);
          return [s, s, roofMat, roofMat, s, s];
        });
        const towers: { x: number; z: number; w: number; d: number; hgt: number }[] = [];
        {
          const rnd = mulberry(23);
          let guard = 0;
          while (towers.length < 190 && guard++ < 4000) {
            const ang = rnd() * Math.PI * 2;
            const rad = 8 + Math.sqrt(rnd()) * 58;
            const x = Math.cos(ang) * rad;
            const z = -66 + Math.sin(ang) * rad;
            const cx = x;
            const cz = z + 66;
            if (cx * cx + cz * cz > 62 * 62) continue;
            // 中心留出地标位置
            if (Math.abs(x) < 7 && Math.abs(z + 60) < 7) continue;
            const core = 1 - Math.min(1, Math.sqrt(x * x + (z + 66) * (z + 66)) / 62);
            towers.push({
              x,
              z,
              w: 2.6 + rnd() * 3.4,
              d: 2.6 + rnd() * 3.4,
              hgt: 4 + rnd() * 10 + core * (14 + rnd() * 22),
            });
          }
        }
        const inst = new THREE.InstancedMesh(towerGeo, towerMats[0], towers.filter((_, i) => i % 3 === 0).length);
        const inst2 = new THREE.InstancedMesh(towerGeo, towerMats[1], towers.filter((_, i) => i % 3 === 1).length);
        const inst3 = new THREE.InstancedMesh(towerGeo, towerMats[2], towers.filter((_, i) => i % 3 === 2).length);
        {
          const m = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          let a = 0;
          let b = 0;
          let c = 0;
          towers.forEach((tb, i) => {
            m.compose(
              new THREE.Vector3(tb.x, tb.hgt / 2, tb.z),
              q,
              new THREE.Vector3(tb.w, tb.hgt, tb.d),
            );
            if (i % 3 === 0) inst.setMatrixAt(a++, m);
            else if (i % 3 === 1) inst2.setMatrixAt(b++, m);
            else inst3.setMatrixAt(c++, m);
          });
          inst.instanceMatrix.needsUpdate = true;
          inst2.instanceMatrix.needsUpdate = true;
          inst3.instanceMatrix.needsUpdate = true;
        }
        cityGrp.add(inst);
        cityGrp.add(inst2);
        cityGrp.add(inst3);

        // 地标塔：三段收分 + 顶冠
        const hero = new THREE.Group();
        const heroMat = new THREE.MeshStandardMaterial({
          color: 0x0c1524,
          roughness: 0.2,
          metalness: 0.85,
          envMapIntensity: 0.6,
          emissive: 0xffffff,
          emissiveMap: windowTex(11),
          emissiveIntensity: 0.5,
        });
        const seg1 = new THREE.Mesh(new THREE.BoxGeometry(9, 22, 9), heroMat);
        seg1.position.y = 11;
        const seg2 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 16, 6.4), heroMat);
        seg2.position.y = 30;
        const seg3 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 20, 3.6), heroMat);
        seg3.position.y = 48;
        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(2.0, 9, 6),
          new THREE.MeshStandardMaterial({ color: 0x2a3444, emissive: 0x9fe8ff, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.8 }),
        );
        crown.position.y = 62;
        hero.add(seg1, seg2, seg3, crown);
        hero.position.set(0, 0, -60);
        cityGrp.add(hero);

        const beacon = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTex, color: "#9ff0ff", transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        beacon.position.set(0, 64, -60);
        beacon.scale.set(7, 7, 1);
        cityGrp.add(beacon);

        // 湿地面：镜面 + 城市倒影
        const wetGround = new THREE.Mesh(
          new THREE.CircleGeometry(96, 64),
          new THREE.MeshStandardMaterial({ color: 0x05070e, roughness: 0.14, metalness: 0.92, envMapIntensity: 0.55 }),
        );
        wetGround.rotation.x = -Math.PI / 2;
        wetGround.position.set(0, -0.02, -66);
        cityGrp.add(wetGround);

        const mirror = new THREE.Group();
        mirror.scale.y = -1;
        mirror.position.y = -0.04;
        mirror.add(inst.clone(), inst2.clone(), inst3.clone());
        cityGrp.add(mirror);

        // 车流光点
        const traffic: InstanceType<typeof THREE.Sprite>[] = [];
        for (let i = 0; i < 10; i++) {
          const sp = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: glowTex, color: i % 2 ? "#ffd0a0" : "#a8f4ff", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
          );
          sp.scale.set(3.4, 1.1, 1);
          sp.position.set((i - 5) * 9, 1.6 + (i % 3) * 0.4, -40 - i * 5);
          traffic.push(sp);
          cityGrp.add(sp);
        }

        // 夜航机
        const aircraft = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.4, metalness: 0.8 }));
        aircraft.add(body);
        const blink = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ff6b5c", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
        blink.position.set(1.3, 0, 0);
        blink.scale.set(1.6, 1.6, 1);
        aircraft.add(blink);
        aircraft.position.set(-30, 44, -120);
        cityGrp.add(aircraft);

        const cityLight = new THREE.PointLight(0xffbe86, 120, 300, 1.6);
        cityLight.position.set(0, 40, -110);
        cityGrp.add(cityLight);
        const cityAmb = new THREE.HemisphereLight(0x33507a, 0x24140e, 0.35);
        cityGrp.add(cityAmb);
        cityRig.visible = false;
        scene.add(cityRig);

        // ══ A5 收藏室 + 水晶球 ═══════════════════════════
        const roomGrp = new THREE.Group();
        const roomMat = new THREE.MeshStandardMaterial({ color: 0x140b06, roughness: 0.94, side: THREE.BackSide, transparent: true, opacity: 0, envMapIntensity: 0.14 });
        const room = new THREE.Mesh(new THREE.BoxGeometry(64, 34, 64), roomMat);
        room.position.set(0, 8, 0);
        roomGrp.add(room);

        // 木纹：程序化细纹理，让台面不是一块死板色块
        const woodTex = texCanvas(512, 512, (ctx) => {
          ctx.fillStyle = "#3a2110";
          ctx.fillRect(0, 0, 512, 512);
          const rnd = mulberry(97);
          for (let i = 0; i < 260; i++) {
            const y = rnd() * 512;
            ctx.strokeStyle = `rgba(${20 + rnd() * 42},${8 + rnd() * 20},${4 + rnd() * 12},${0.08 + rnd() * 0.26})`;
            ctx.lineWidth = 0.6 + rnd() * 2.4;
            ctx.beginPath();
            ctx.moveTo(0, y);
            for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin((x / 512) * Math.PI * 2 + i) * 3 + (rnd() - 0.5) * 2);
            ctx.stroke();
          }
        });
        woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
        woodTex.repeat.set(3, 2);
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3418, map: woodTex, roughness: 0.42, metalness: 0.04, transparent: true, opacity: 0, envMapIntensity: 0.3 });
        const table = new THREE.Mesh(new THREE.BoxGeometry(22, 0.7, 13), woodMat);
        table.position.set(0, -1.95, 0);
        roomGrp.add(table);
        const tableInlay = new THREE.Mesh(
          new THREE.BoxGeometry(22.4, 0.12, 13.4),
          new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.4, metalness: 0.15, transparent: true, opacity: 0, envMapIntensity: 0.5 }),
        );
        tableInlay.position.set(0, -1.58, 0);
        roomGrp.add(tableInlay);

        // 球座
        const stand = new THREE.Mesh(
          new THREE.CylinderGeometry(1.05, 1.5, 0.42, 40),
          new THREE.MeshStandardMaterial({ color: 0x6b4a26, roughness: 0.45, metalness: 0.25, transparent: true, opacity: 0, envMapIntensity: 0.6 }),
        );
        stand.position.set(0, -1.48, 0);
        roomGrp.add(stand);

        // 水晶球：薄膜干涉 + 透射
        const ballMat = new THREE.MeshPhysicalMaterial({
          transmission: 1,
          thickness: 0.85,
          roughness: 0.035,
          ior: 1.5,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
          iridescence: 0.35,
          iridescenceIOR: 1.32,
          iridescenceThicknessRange: [120, 520],
          envMapIntensity: 0.85,
          specularIntensity: 0.95,
          color: 0xffffff,
          transparent: true,
        });
        const ball = new THREE.Mesh(new THREE.SphereGeometry(2.6, 96, 64), ballMat);
        ball.position.set(0, 1.05, 0);
        ball.visible = false;
        roomGrp.add(ball);

        // 球内烟雾
        const ballSmoke: InstanceType<typeof THREE.Sprite>[] = [];
        {
          const rnd = mulberry(53);
          for (let i = 0; i < 9; i++) {
            const sp = new THREE.Sprite(
              new THREE.SpriteMaterial({ map: cloudTex, color: i % 2 ? "#ffd6a8" : "#bfe6ff", transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }),
            );
            sp.position.set((rnd() - 0.5) * 2.6, 0.3 + (rnd() - 0.5) * 2.2, (rnd() - 0.5) * 2.6);
            sp.scale.set(3 + rnd() * 2.6, 2 + rnd() * 2, 1);
            ballSmoke.push(sp);
            roomGrp.add(sp);
          }
        }

        // 桌面焦散
        const caustic = new THREE.Mesh(
          new THREE.PlaneGeometry(9, 6.4),
          new THREE.MeshBasicMaterial({ map: causticTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        caustic.rotation.x = -Math.PI / 2;
        caustic.position.set(0, -1.6, 0.4);
        roomGrp.add(caustic);

        // 暖光展罩 + 发光晶体
        const domes: InstanceType<typeof THREE.Mesh>[] = [];
        for (let i = 0; i < 4; i++) {
          const side = i < 2 ? -1 : 1;
          const dome = new THREE.Mesh(
            new THREE.SphereGeometry(1.15, 32, 24),
            new THREE.MeshPhysicalMaterial({ transmission: 0.96, thickness: 0.3, roughness: 0.08, ior: 1.4, transparent: true })
          );
          dome.position.set(side * (5.6 + (i % 2) * 2.4), -0.9, 2 + i * 0.4);
          domes.push(dome);
          roomGrp.add(dome);

          const blob = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.44, 1),
            new THREE.MeshStandardMaterial({
              color: 0x101820,
              emissive: i % 2 ? 0xff7ad0 : 0x66e8ff,
              emissiveIntensity: 0.35,
              roughness: 0.3,
            }),
          );
          blob.position.copy(dome.position);
          roomGrp.add(blob);
        }

        // 暖光灯 + 体积光锥
        const warmA = new THREE.PointLight(0xffb066, 42, 40, 1.8);
        warmA.position.set(-6.4, 5.2, 2.2);
        const warmB = new THREE.PointLight(0xff8f4d, 26, 34, 1.8);
        warmB.position.set(6.2, 4.2, -2.6);
        roomGrp.add(warmA, warmB);

        roomGrp.visible = false;
        scene.add(roomGrp);

        // ══ A6 泡膜破裂 ════════════════════════════════
        // 液滴（CPU 更新的粒子）
        const dropN = 460;
        const dropGeo = new THREE.BufferGeometry();
        const dropPos = new Float32Array(dropN * 3);
        const dropDir: { x: number; y: number; z: number; sp: number }[] = [];
        const dropRnd = mulberry(71);
        for (let i = 0; i < dropN; i++) {
          const u = dropRnd() * Math.PI * 2;
          const v = Math.acos(2 * dropRnd() - 1);
          const nx = Math.sin(v) * Math.cos(u);
          const ny = Math.cos(v);
          const nz = Math.sin(v) * Math.sin(u);
          dropDir.push({ x: nx, y: ny, z: nz, sp: 5 + dropRnd() * 16 });
        }
        dropGeo.setAttribute("position", new THREE.BufferAttribute(dropPos, 3));
        const drops = new THREE.Points(
          dropGeo,
          new THREE.PointsMaterial({ size: 0.16, map: glowTex, color: 0xdff4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        drops.visible = false;
        scene.add(drops);

        // ══ A7 曲速 + 棱镜 ═══════════════════════════════
        const warpGrp = new THREE.Group();
        const warpN = 640;
        const warpGeo = new THREE.BufferGeometry();
        const warpPos = new Float32Array(warpN * 6);
        const warpMeta: { ang: number; rad: number; z: number; len: number }[] = [];
        {
          const rnd = mulberry(83);
          for (let i = 0; i < warpN; i++) {
            warpMeta.push({ ang: rnd() * Math.PI * 2, rad: 1.4 + rnd() * 15, z: -rnd() * 220, len: 4 + rnd() * 16 });
          }
        }
        warpGeo.setAttribute("position", new THREE.BufferAttribute(warpPos, 3));
        const warpLines = new THREE.LineSegments(
          warpGeo,
          new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        warpGrp.add(warpLines);
        const prism = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: prismTex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
        );
        prism.position.set(0, 0, -34);
        prism.scale.set(120, 120, 1);
        warpGrp.add(prism);
        warpGrp.visible = false;
        scene.add(warpGrp);

        // ══ A8 光核 ════════════════════════════════════
        const coreGrp = new THREE.Group();
        const coreBall = new THREE.Mesh(
          new THREE.SphereGeometry(1.15, 48, 32),
          new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff8ff, emissiveIntensity: 1.1, roughness: 0.1, metalness: 0 }),
        );
        coreBall.position.set(0, 1.6, -6);
        const coreHalo = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTex, color: "#bfeaff", transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
        );
        coreHalo.position.copy(coreBall.position);
        coreHalo.scale.set(22, 22, 1);
        const coreRing = new THREE.Mesh(
          new THREE.TorusGeometry(4.2, 0.09, 12, 90),
          new THREE.MeshBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        coreRing.position.copy(coreBall.position);
        coreRing.rotation.x = 1.16;
        coreGrp.add(coreBall, coreHalo, coreRing);
        coreGrp.visible = false;
        scene.add(coreGrp);

        // 转场闪白（挂在相机上）
        const flash = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.NormalBlending }),
        );
        flash.scale.set(220, 220, 1);
        flash.position.set(0, 0, -2);
        camera.add(flash);
        scene.add(camera);

        // ── 时间轴 ────────────────────────────────────
        const lookTarget = new THREE.Vector3();
        const clock = { start: performance.now() };
        let raf = 0;
        let lastT = startAt;
        let primed = freezeAt === undefined || freezeAt <= 21.6;

        const update = (t: number, time: number) => {
          camera.up.set(0, 1, 0);
          camera.fov = 55;
          let flashOp = 0;

          // 各组可见性与默认隐藏
          cosmicGrp.visible = t < 4.35;
          atmosGrp.visible = t > 3.85 && t < 7.8;
          canyonGrp.visible = t > 7.25 && t < 12.0;
          cityRig.visible = t > 11.75 && t < 24.15;
          roomGrp.visible = t > 17.32 && t < 24.15;
          warpGrp.visible = t > 24.0 && t < 27.3;
          coreGrp.visible = t > 26.5;

          // A1 深空
          if (t < 4.35) {
            const k = smooth(0, 4.1, t);
            camera.position.set(lerp(0, 2.4, k), lerp(0, -1.2, k), lerp(36, 17, k));
            lookTarget.set(0, 2, -170);
            cosmicBgMat.opacity = 1 - smooth(3.9, 4.35, t);
            cosmicBg.scale.setScalar(1 + k * 0.14);
            cosmicBg.position.y = 10 + k * 3;
            stars.rotation.z = t * 0.012;
            godRays.forEach((m, i) => {
              const mat = m.material as InstanceType<typeof THREE.MeshBasicMaterial>;
              mat.opacity = (0.1 + 0.04 * Math.sin(t * 0.8 + i)) * (1 - smooth(3.5, 4.2, t));
              m.rotation.z = -0.14 + i * 0.14 + Math.sin(t * 0.4 + i) * 0.02;
            });
            cosmicSun.material.opacity = 0.5;
            cosmicStreak.material.opacity = 0.16 + Math.sin(t * 1.2) * 0.04;
            dustNear.rotation.y = t * 0.05;
            fog.color.setHex(0x070b22);
            fog.density = 0.0034;
          }

          // A2 大气俯冲
          if (t > 3.85 && t < 7.8) {
            const k = smooth(3.85, 7.6, t);
            camera.position.set(lerp(2.4, -1.6, k), lerp(-1.2, -12, k), lerp(17, -6, k));
            lookTarget.set(lerp(0, 2, k), lerp(1, -22, k), -165);
            peaksMat.opacity = smooth(4.0, 5.0, t) * 0.95;
            peaksBg.position.y = -6 - k * 8;
            clouds.forEach((sp, i) => {
              const c = sp.material as InstanceType<typeof THREE.SpriteMaterial>;
              const close = i % 2 === 0 ? 1 : 0.55;
              c.opacity = (0.14 + 0.1 * (i % 5) / 5) * smooth(3.95, 4.9, t) * close;
              sp.position.z += 0.16 * (1 + (i % 4)) * 1.0;
              if (sp.position.z > 16) sp.position.z = -86;
              sp.position.y = -12 + Math.sin(t * 0.5 + i) * 2;
            });
            beams.forEach((m, i) => {
              const mat = m.material as InstanceType<typeof THREE.MeshBasicMaterial>;
              mat.opacity = 0.2 * smooth(4.0, 5.2, t) * (1 - smooth(6.9, 7.6, t)) * (0.7 + 0.3 * Math.sin(t * 2 + i));
            });
            atmosSun.material.opacity = 0.6;
            atmosStreak.material.opacity = 0.3;
            fog.color.setHex(0x2b3550);
            fog.density = 0.0055;
            flashOp = 1 - Math.abs(t - 4.0) * 7;
            if (flashOp < 0) flashOp = 0;
          }

          // A3 峡谷掠行
          if (t > 7.25 && t < 12.0) {
            const k = smooth(7.25, 12.0, t);
            const camX = lerp(-16, 20, k);
            camera.position.set(camX, lerp(4.6, 2.4, k), lerp(10, 3, k));
            lookTarget.set(camX + 9, lerp(3.4, 1.6, k), -150);
            canyonMat.opacity = smooth(7.3, 8.0, t) * (1 - smooth(11.4, 11.95, t));
            canyonBg.position.x = -camX * 0.35;
            canyonBg.scale.setScalar(1 + k * 0.2);
            ridgeFar.position.x = -camX * 0.62;
            ridgeNear.position.x = -camX * 0.95;
            ridgeFar.position.y = -44 - k * 8;
            ridgeNear.position.y = -52 - k * 10;
            dust.rotation.y = t * 0.02;
            (dust.material as InstanceType<typeof THREE.PointsMaterial>).opacity = 0.38 * (1 - smooth(11.4, 11.95, t));
            craft.position.set(camX + lerp(-30, 14, k), 3.2 + Math.sin(t * 1.4) * 0.5, -46);
            ringGlow.material.opacity = 0.8;
            (ring.material as InstanceType<typeof THREE.MeshStandardMaterial>).emissiveIntensity = 2.2 + Math.sin(t * 4) * 0.5;
            fog.color.setHex(0x3a2a22);
            fog.density = 0.0062;
            flashOp = Math.max(0, 1 - Math.abs(t - 7.35) * 9);
          }

          // A4 黄昏都市：高空扫掠 → 低空推近地标（机位全程不进入楼体）
          if (t > 11.75 && t < 17.35) {
            const k = smooth(11.8, 15.0, t);
            const k2 = smooth(15.0, 17.35, t);
            if (t < 15.0) {
              camera.position.set(lerp(-22, -9, k), lerp(34, 27, k), lerp(12, -10, k));
              lookTarget.set(lerp(14, 0, k), lerp(34, 30, k), lerp(-92, -70, k));
            } else {
              camera.position.set(lerp(-9, -2, k2), lerp(27, 20, k2), lerp(-10, -6, k2));
              lookTarget.set(0, lerp(30, 27, k2), -62);
            }
            citySky.visible = true;
            wetGround.visible = true;
            cityRig.scale.setScalar(1);
            cityRig.position.set(0, 0, 0);
            citySkyMat.opacity = smooth(11.8, 12.9, t);
            citySky.scale.setScalar(1 + smooth(11.8, 17.35, t) * 0.1);
            citySun.material.opacity = 0.6 + Math.sin(t * 0.9) * 0.05;
            cityStreak.material.opacity = 0.36;
            towerSide.forEach((m) => (m.emissiveIntensity = 0.72 + Math.sin(t * 2.2) * 0.06));
            beacon.material.opacity = 0.55 + Math.sin(t * 4.4) * 0.4;
            traffic.forEach((sp, i) => {
              const dir = i % 2 ? 1 : -1;
              sp.position.x = (((t * (13 + i * 2.6) * dir + i * 29) % 150) + 150) % 150 - 75;
            });
            aircraft.position.x = -52 + ((t * 7) % 104);
            aircraft.position.y = 46 + Math.sin(t * 0.7) * 2;
            blink.material.opacity = Math.sin(t * 3.2) > 0 ? 0.95 : 0.1;
            fog.color.setHex(0x4a3226);
            fog.density = 0.0044 + k * 0.0012;
            flashOp = Math.max(0, 1 - Math.abs(t - 11.85) * 8);
          }

          // A5 闪白硬切 → 暖木收藏室，水晶球里封存着一座微缩城市
          // 切前是航拍地标塔，切后是球心同一座塔 —— 匹配剪（match cut）
          if (t > 17.3 && t < 24.15) {
            const CITY_IN_BALL = 0.03;
            cityRig.scale.setScalar(CITY_IN_BALL);
            cityRig.position.set(0, 0.52, 66 * CITY_IN_BALL);
            citySky.visible = false; // 底片不能跟进球里，否则会变成一块挡在房间里的巨幅画
            wetGround.visible = false; // 城市地面圆盘缩进球里会变成一块灰板

            const k = smooth(17.55, 19.9, t);
            const k2 = smooth(20.0, 21.5, t);
            camera.position.set(
              lerp(2.8, 1.05, k) + Math.sin(k2 * Math.PI) * 0.55,
              lerp(2.95, 1.85, k),
              lerp(14.8, 8.4, k),
            );
            lookTarget.set(0, 1.15, 0);
            camera.fov = lerp(55, 42, k);

            // 收藏室（切白瞬间已就位，避免淡入露馅）
            const roomIn = smooth(17.3, 17.8, t);
            roomMat.opacity = roomIn * 0.96;
            woodMat.opacity = roomIn;
            (tableInlay.material as InstanceType<typeof THREE.MeshStandardMaterial>).opacity = roomIn;
            (stand.material as InstanceType<typeof THREE.MeshStandardMaterial>).opacity = roomIn;
            domes.forEach((d) => {
              (d.material as InstanceType<typeof THREE.MeshPhysicalMaterial>).opacity = roomIn;
              (d.material as InstanceType<typeof THREE.MeshPhysicalMaterial>).transparent = true;
            });
            (caustic.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = roomIn * (0.22 + Math.sin(t * 1.6) * 0.05);
            ball.visible = t > 17.4;
            ballSmoke.forEach((sp, i) => {
              const m = sp.material;
              m.opacity = roomIn * (0.04 + (i % 3) * 0.012);
              sp.position.x = (i % 3 - 1) * 0.9 + Math.sin(t * 0.6 + i) * 0.35;
              sp.position.y = 0.75 + Math.cos(t * 0.5 + i) * 0.5;
            });
            warmA.intensity = 18 * roomIn;
            warmB.intensity = 10 * roomIn;

            citySun.material.opacity = 0.06;
            towerSide.forEach((m) => (m.emissiveIntensity = 1.2));
            fog.color.setHex(0x241811);
            fog.density = 0.0085;
            flashOp = Math.max(0, 1 - Math.abs(t - 17.35) * 6.5);
          }

          // A6 薄膜虹彩 + 破裂
          if (t > 21.5 && t < 24.4) {
            const ki = smooth(21.5, 23.0, t);
            const kg = smooth(22.6, 23.95, t);
            ballMat.iridescence = 0.35 + ki * 0.65;
            ballMat.iridescenceThicknessRange = [120 + ki * 260, 520 + ki * 500];
            ballMat.roughness = 0.035 + ki * 0.01;
            ball.scale.setScalar(1 + kg * 2.6);
            camera.position.set(
              lerp(1.05, 0.25, kg),
              lerp(1.85, 1.2, kg),
              lerp(8.4, 16.0, kg),
            );
            camera.fov = lerp(42, 47, kg);
            lookTarget.set(0, 1.05, 0);

            const burstAt = 23.95;
            if (t > burstAt) {
              ball.visible = false;
              cityRig.visible = false;
              drops.visible = true;
              const age = t - burstAt;
              const dm = drops.material as InstanceType<typeof THREE.PointsMaterial>;
              dm.opacity = Math.max(0, 0.95 - age * 0.55);
              dm.size = 0.16 + age * 0.1;
              const arr = dropGeo.getAttribute("position") as InstanceType<typeof THREE.BufferAttribute>;
              for (let i = 0; i < dropN; i++) {
                const d = dropDir[i];
                const r = 9.36 + d.sp * age;
                arr.setXYZ(i, d.x * r, 1.05 + d.y * r * 0.9 + 0.5 * age * age, d.z * r);
              }
              arr.needsUpdate = true;
              flashOp = Math.max(0, 1 - age * 3.2);
            }
          }

          // A7 曲速 + 棱镜
          if (t > 24.0 && t < 27.3) {
            const k = smooth(24.0, 26.2, t);
            camera.position.set(0, 0, 4);
            lookTarget.set(0, 0, -80);
            camera.fov = lerp(52, 82, smooth(24.2, 25.9, t));
            const arr = warpGeo.getAttribute("position") as InstanceType<typeof THREE.BufferAttribute>;
            for (let i = 0; i < warpN; i++) {
              const m = warpMeta[i];
              const z = ((m.z + t * 132) % 240) - 220;
              const x1 = Math.cos(m.ang) * m.rad;
              const y1 = Math.sin(m.ang) * m.rad;
              const x2 = Math.cos(m.ang) * (m.rad + 0.06);
              const y2 = Math.sin(m.ang) * (m.rad + 0.06);
              arr.setXYZ(i * 2, x1, y1, z);
              arr.setXYZ(i * 2 + 1, x2, y2, z + m.len * (1 + k * 1.5));
            }
            arr.needsUpdate = true;
            (warpLines.material as InstanceType<typeof THREE.LineBasicMaterial>).opacity = 0.35 + k * 0.5;
            prism.material.opacity = 0.28 * k;
            prism.scale.setScalar(90 + k * 90);
            fog.color.setHex(0x060b1e);
            fog.density = 0.004;
            flashOp = Math.max(0, 1 - Math.abs(t - 24.05) * 5);
          }

          // A8 光核
          if (t > 26.5) {
            const k = smooth(26.5, 28.0, t);
            camera.position.set(0, 0.2, lerp(9, 6.4, k));
            lookTarget.set(0, 1.6, -6);
            camera.fov = lerp(60, 46, k);
            coreBall.scale.setScalar(0.5 + k * 0.9);
            coreHalo.scale.setScalar(lerp(3.5, 8, k));
            coreHalo.material.opacity = 0.22 + Math.sin(t * 3) * 0.05;
            coreRing.rotation.z = t * 0.12;
            coreRing.scale.setScalar(lerp(0.6, 1.15, k));
            fog.color.setHex(0x04061a);
            fog.density = 0.0026;
            bloom.strength = 0.36 + smooth(26.5, 27.6, t) * 0.1;
          } else {
            bloom.strength = 0.36;
          }

          flash.material.opacity = Math.min(1, flashOp) * 0.95;
          grade.uniforms.uTime.value = time;
          camera.lookAt(lookTarget);
          camera.updateMatrixWorld();
        };

        const loop = () => {
          raf = requestAnimationFrame(loop);
          if (document.hidden && freezeAt === undefined) {
            clock.start = performance.now() - lastT * 1000;
            return;
          }
          if (!primed) {
            primed = true;
            update(21.5, performance.now() / 1000);
          }
          const t = freezeAt !== undefined ? freezeAt : (performance.now() - clock.start) / 1000 + startAt;
          lastT = t;
          update(t, performance.now() / 1000);
          grade.uniforms.uTime.value = performance.now() / 1000;

          if (!titleFired.current && freezeAt === undefined && t >= T_TITLE) {
            titleFired.current = true;
            onTitleRef.current?.();
          }
          composer.render();
        };
        loop();

        const onResize = () => {
          if (!mountRef.current) return;
          w = mountRef.current.clientWidth;
          h = mountRef.current.clientHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          composer.setSize(w, h);
          grade.uniforms.uRes.value.set(w, h);
        };
        window.addEventListener("resize", onResize);

        cleanup = () => {
          window.removeEventListener("resize", onResize);
          cancelAnimationFrame(raf);
          renderer.dispose();
          pmrem.dispose();
          if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
        };
      },
    );

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [startAt, freezeAt]);

  return <div ref={mountRef} className="absolute inset-0" />;
}
