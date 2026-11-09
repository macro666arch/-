# 中传校园办事助手 — 云端部署包（Neon + Render + Upstash + Vercel）

> 五件套上云对应关系：
> 本地 PG(5433) → **Neon** 数据库（支持 pgvector）
> 本地 Redis(6379) → **Upstash**
> 本地 NestJS 后端(3001) → **Render Web Service**（`server/`，Docker 构建）
> 本地 Python 向量服务(9430) → **Render Web Service**（`embedding/`，Docker 构建）
> 本地 Next.js 前端(3000) → **Vercel**（`web/`）

## 目录结构

```
server/      NestJS 后端（Dockerfile 在内，Render 直接指向此目录）
embedding/   Python 向量服务（fastembed bge-small-zh-v1.5，首次启动自动下载模型）
web/         Next.js 前端（Vercel 部署，/api 同源透传到后端）
```

## 部署顺序（严格按顺序做）

### ① Neon — 建库导数据
1. neon.tech 用 GitHub 登录 → New Project（区域选 Singapore 或 AWS us-east）
2. 复制 Connection string（pooled）
3. 本地导数据：`pg_dump` 本地库 → 在 Neon SQL Editor 里先 `CREATE EXTENSION vector;` → 再导入
4. Neon 免费层 0.5GB，业务库远小于此

### ② Render — 向量服务（先部署它，后端要用它的地址）
1. render.com 用 GitHub 登录 → New → Web Service → 选本仓库
2. Root Directory: `embedding`，Runtime: Docker，Instance: Free
3. 部署完成后得到地址 `https://xxx.onrender.com`（这就是 EMBEDDING_URL）

### ③ Render — 后端
1. New → Web Service → 同一仓库
2. Root Directory: `server`，Runtime: Docker，Instance: Free
3. Environment 按仓库里 `server/.env.example` 逐项填（DEEPSEEK_API_KEY / ENCRYPTION_KEY / JWT_SECRET 用本地 .env 的同一套值）
4. EMBEDDING_URL 填第②步的地址
5. Health Check Path: `/api/notices?limit=1`

### ④ Upstash — Redis
1. upstash.com 用 GitHub 登录 → Create Database（区域与 Render 同区）
2. 复制 REDIS_URL（rediss:// 开头）填进 Render 后端环境变量

### ⑤ Vercel — 前端
1. vercel.com 用 GitHub 登录 → Import 本仓库
2. Root Directory: `web`
3. 环境变量：
   - `NEXT_PUBLIC_USE_MOCK=false`
   - `NEXT_PUBLIC_API_BASE=/`
   - `BACKEND_ORIGIN=https://<第③步后端地址>`（next.config 的 rewrites 会用它透传 /api）
4. Deploy 后得到 `https://xxx.vercel.app`

## 注意事项

- Render 免费实例 15 分钟无流量会休眠，首访冷启动 30-60 秒；Vector 服务同理
- 向量模型每次重启重新下载（约 100MB），启动约 2-3 分钟
- 密钥一律走平台环境变量，仓库里没有任何 .env
- 本地默认 EMBEDDING_URL 不填时仍指向 127.0.0.1:9430，本地开发不受影响
