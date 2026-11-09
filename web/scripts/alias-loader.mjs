/**
 * 把 Next.js 的 "@/xxx" 路径别名映射到 src/xxx，让 Node 能直接跑 TypeScript 源码。
 * 这样测试脚本测的是**线上跑的同一份代码**，而不是另抄一份 —— 抄一份的测试没有意义。
 */
import { pathToFileURL } from "node:url";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolvePath(HERE, "..", "src");

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const target = pathToFileURL(resolvePath(SRC, specifier.slice(2))).href;
    // 允许省略扩展名：依次尝试 .ts / .tsx / /index.ts
    for (const cand of [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`]) {
      try {
        return await next(cand, context);
      } catch {
        /* 试下一个 */
      }
    }
  }
  return next(specifier, context);
}
