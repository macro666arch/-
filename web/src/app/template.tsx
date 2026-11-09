"use client";

/**
 * 页面转场：App Router template 在每次路由切换时重挂载，
 * 内容以上浮 + 去模糊 + 微缩放的方式进入，避免生硬切换。
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
