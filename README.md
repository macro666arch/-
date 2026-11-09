# 中传校园办事助手 — 云端部署包（Supabase + Render + Upstash + Vercel）

> 五件套上云对应关系：
> 本地 PG(5433) → **Supabase** Postgres 17（已启用 pgvector，数据已导入）
> 本地 Redis(6379) → **Upstash**
> 本地 NestJS 后端(3001) → **Render Web Service**（`server/`，Docker 构建）
> 本地 Python 向量服务(9430) → **Render Web Service**（`embedding/`，Docker 构建）
> 本地 Next.js 前端(3000) → **Vercel**（`web/`，`/api` 同源 rewrite 到后端）

## 目录结构

```
render.yaml     Render Blueprint，一次创建两个服务（推荐）
server/         NestJS 后端（Dockerfile 在内）
embedding/      Python 向量服务（fastembed bge-small-zh-v1.5，首次启动自动下载模型）
web/            Next.js 前端
```

## 已经做完的事

- GitHub 仓库已推送：`https://github.com/macro666arch/-`
- Supabase 项目 `cuc-assistant`（Seoul，Postgres 17.11）已建好
- 已执行 `CREATE EXTENSION IF NOT EXISTS vector;` 与 `"uuid-ossp";`
- 已导入本地 dump（`/d/temp/deploy-data/nau_advisor_cloud.sql`），验证 `knowledge_chunks=5`、`users=1`，向量维度一致
- 后端已针对托管库补上显式 TLS 连接配置（见 `server/apps/api/src/app.module.ts`）

## 部署顺序（严格按顺序做）

### ① Render — 用 Blueprint 一次拉起两个服务（推荐）

1. 登录 render.com（GitHub 账号），授权访问本仓库
2. Dashboard → **New** → **Blueprint** → 选仓库 `macro666arch/-`
3. Render 读取根目录 `render.yaml`，自动列出 `cuc-embedding` 与 `cuc-api` 两个 Free Web Service
4. 在部署前把标记为「需手动填写」的环境变量补齐（见下表），点 **Apply**
5. 两个服务都变 Live 后，复制 `cuc-embedding` 的公网地址 `https://cuc-embedding.onrender.com`

> 若不用 Blueprint，也可以手动 New → Web Service 两次：
> Root Directory 分别填 `embedding` / `server`，Runtime 都是 **Docker**，Instance Type **Free**，
> Health Check Path 分别是 `/health` 和 `/api/health`（不要再用 `/api/notices`，那个接口可能返回非 2xx）。

### ② Render — 后端环境变量

固定值（Blueprint 已写入）：`PORT=10000`、`NODE_ENV=production`、`DEEPSEEK_MODEL=deepseek-chat`、
`DEEPSEEK_API_URL=https://api.deepseek.com/chat/completions`、`OCR_PROVIDER=tesseract`、
`ALLOWED_EMAIL_DOMAINS=cuc.edu.cn`、`ENABLE_FEISHU_REMIND=false`、`ENABLE_FRESHNESS_CRON=false`。

需要手工填的（绝不能写进仓库）：

| 变量 | 来源 |
| --- | --- |
| `DATABASE_URL` | Supabase → Connect → **Session pooler**（5432），末尾加 `?sslmode=require` |
| `REDIS_URL` | Upstash → Create Database → 复制 `rediss://default:xxx@host:6379` |
| `DEEPSEEK_API_KEY` | 本地 `.env` 里的同一把 key |
| `ENCRYPTION_KEY` / `JWT_SECRET` | 本地 `.env` 里的同一套值，改了会让旧登录态失效 |
| `JWT_EXPIRES_IN` / `REFRESH_TOKEN_EXPIRES_DAYS` | 本地 `.env` 同值 |
| `EMBEDDING_URL` | 第①步 `cuc-embedding` 的公网地址；填完后手动 **Manual Deploy → Deploy latest commit** 让后端重新读取 |
| `FRONTEND_URL` / `CORS_ORIGINS` | 第④步拿到 `https://xxx.vercel.app` 后回填（用 rewrite 同源访问时可不填） |

> Supabase 连接串形如
> `postgresql://postgres.<项目ID>:<密码>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require`
> 密码里的 `!`、`+`、`@` 等字符必须做 URL 编码（`!`→`%21`、`+`→`%2B`、`@`→`%40`），
> 否则密码会被当成 URL 分隔符，表现为「密码错误 / 连接超时」。密码只存在 Render 环境变量里。

### ③ Upstash — Redis

upstash.com 用 GitHub 登录 → Create Database（区域尽量与 Render 同区）→ 复制 `rediss://` 开头的 URL
填进 Render 后端的 `REDIS_URL`。Bull 队列与会话缓存都走它。

### ④ Vercel — 前端

1. vercel.com 用 GitHub 登录 → Add New → Project → Import 本仓库
2. **Root Directory: `web`**，Framework 选 Next.js，其余默认
3. 环境变量：
   - `NEXT_PUBLIC_USE_MOCK=false`
   - `NEXT_PUBLIC_API_BASE=/`（走同源 rewrite，浏览器不跨域）
   - `BACKEND_ORIGIN=https://cuc-api.onrender.com`（第①步后端公网地址，`next.config.mjs` 的 rewrites 用它透传 `/api`）
4. Deploy 后得到 `https://xxx.vercel.app`，把它回填到 Render 的 `FRONTEND_URL`

## 上线后自检

1. `https://cuc-embedding.onrender.com/health` → `ok`
2. `https://cuc-api.onrender.com/api/health` → `{"ok":true,...}`
3. `https://xxx.vercel.app/api/notices?limit=1` → 返回 JSON（证明 rewrite 打通）
4. 前端首页能打开 → 登录页 → 问一个「教务处电话 / 选课流程」类问题，确认 RAG 检索与大模型都通

## 注意事项

- Render 免费实例 15 分钟无流量会休眠，首访冷启动 30–60 秒；向量服务同理
- 向量模型每次重启重新下载（约 100MB），首次启动约 2–3 分钟，健康检查会在模型加载完成后才通过
- Docker 服务必须监听 `$PORT`（Render 注入 10000）并绑定 `0.0.0.0`；两个服务已按此写好
- 生产环境 `synchronize=false`，不会自动建表；表结构与数据来自已导入的 dump
- 密钥一律走平台环境变量，仓库里没有任何 `.env`
- 本地不填 `EMBEDDING_URL` 时仍指向 `127.0.0.1:9430`，本地开发不受影响
