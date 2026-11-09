"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * 全站滚动显现：自动给 main 下的非 hero section 加进入视口时
 * 上浮 + 去模糊的显现动画。reduced-motion 下不处理。
 */
export default function AutoReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main section:not(.hero), main article",
      ),
    );
    if (!sections.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.classList.add("fx-reveal-in");
            io.unobserve(el);
            // 动画结束后清理类与 will-change，归还合成层
            window.setTimeout(() => {
              el.classList.remove("fx-reveal-init", "fx-reveal-in");
              el.style.transitionDelay = "";
            }, 1150);
          }
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -6% 0px" },
    );

    sections.forEach((el, i) => {
      el.classList.add("fx-reveal-init");
      el.style.transitionDelay = `${Math.min(i, 4) * 70}ms`;
      io.observe(el);
    });

    return () => {
      io.disconnect();
      sections.forEach((el) => {
        el.classList.remove("fx-reveal-init", "fx-reveal-in");
        el.style.transitionDelay = "";
      });
    };
  }, [pathname]);

  return null;
}
