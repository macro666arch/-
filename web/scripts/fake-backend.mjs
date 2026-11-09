/**
 * C2/C3 协议的临时内存后端，只用于前端联调和自动化测试。
 * 用法：node scripts/fake-backend.mjs [port]
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.argv[2] || 3901);
const users = new Map();
const usersById = new Map();
const sessions = new Map();
const tasks = new Map();
let nextTaskSequence = 1;

const contact = {
  id: "c001",
  item_id: "学籍管理",
  business_name: "学籍管理咨询",
  dept_name: "教务处 学籍管理科",
  phone: "65783223",
  location_id: null,
  office_hours: null,
  conflict_flag: true,
  history_phones: [
    {
      phone: "65783223",
      valid_from: null,
      valid_to: null,
      source_url: "https://jwc.cuc.edu.cn/jwcyx/list.htm",
    },
    {
      phone: "65773223",
      valid_from: null,
      valid_to: null,
      source_url: "https://its.cuc.edu.cn/xskyqblzn/list.htm",
    },
  ],
  route_keywords: ["学籍证明", "成绩有问题", "在读证明"],
  source: "教务处",
  source_url: "https://jwc.cuc.edu.cn/jwcyx/list.htm",
  publish_date: null,
  last_verified_at: "2026-10-29",
  verify_status: "待核实",
  effective_status: "待核实",
};

const processRecord = {
  id: "p001",
  item_id: "休学复学",
  process_name: "休学申请",
  applicable_to: "全日制本科生",
  conditions: ["因病或其他正当理由"],
  required_materials: ["休学申请表", "医院证明"],
  steps: [
    {
      step_no: 1,
      action: "填写休学申请表",
      responsible_role: "学生本人",
    },
    { step_no: 2, action: "学院审核", responsible_role: "所在学院" },
  ],
  dept_id: "教务处",
  source: "教务处",
  source_url: "https://jwc.cuc.edu.cn/",
  publish_date: null,
  last_verified_at: "2026-10-29",
  verify_status: "已核实",
  effective_status: "现行",
};

const notice = {
  id: "n1",
  item_id: null,
  notice_name: "秋季补退选课通知",
  channel: "官网",
  deadline: "2026-12-03",
  notice_status: "正在适用",
  ok: true,
  source: "教务处",
  source_url: "https://jwc.cuc.edu.cn/",
  publish_date: "2026-11-20",
  last_verified_at: null,
  verify_status: "已核实",
  effective_status: "现行",
};

const faq = {
  id: "f1",
  item_id: null,
  question: "怎么补办学生证？",
  category: "证件",
  answer_ref: "p002",
  synonym_questions: ["学生证丢了"],
  source_type: "官方规定",
  source: "教务处",
  source_url: "https://jwc.cuc.edu.cn/",
  publish_date: null,
  last_verified_at: null,
  verify_status: "待核实",
  effective_status: "待核实",
};

const serviceHour = {
  id: "sh1",
  item_id: null,
  business_id: "b1",
  business_name: "学籍证明（纸质盖章）",
  open_days: "工作日",
  time_slot: "08:00-11:30, 13:30-16:30",
  source: "教务处",
  source_url: "https://jwc.cuc.edu.cn/",
  publish_date: null,
  last_verified_at: null,
  verify_status: "待核实",
  effective_status: "待核实",
};

const calendar = {
  academic_year: "2026-2027",
  semester: "秋",
  term_start: "2026-09-07",
  term_end: "2027-01-17",
  teaching_weeks: "1-17",
  exam_weeks: "18-19",
  holidays: [],
  daily_schedule: {
    第一节: "8:00",
    第五节: "13:30",
    第九节: "18:00",
  },
};

const freshness = {
  total: 22,
  current: 14,
  stale: 3,
  expired: 2,
  pending: 3,
  threshold_days: 90,
  by_table: [
    {
      table: "processes",
      total: 6,
      stale: 1,
      expired: 0,
      pending: 1,
      current: 4,
    },
    {
      table: "contacts",
      total: 5,
      stale: 1,
      expired: 0,
      pending: 1,
      current: 3,
    },
    {
      table: "notices",
      total: 5,
      stale: 1,
      expired: 1,
      pending: 0,
      current: 3,
    },
    {
      table: "policies",
      total: 4,
      stale: 0,
      expired: 1,
      pending: 1,
      current: 2,
    },
    {
      table: "calendar",
      total: 2,
      stale: 0,
      expired: 0,
      pending: 0,
      current: 2,
    },
  ],
};

function sendJson(res, status, body = null) {
  res.statusCode = status;
  if (body === null || status === 204) {
    res.end();
    return;
  }
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error("请求体不是合法 JSON"), { status: 400 });
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    first_name: user.first_name,
  };
}

function sessionResponse(user) {
  const access_token = `fake-token-${randomUUID()}`;
  sessions.set(access_token, user.id);
  return { access_token, user: publicUser(user) };
}

function authenticatedUser(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const userId = sessions.get(match[1]);
  return userId ? usersById.get(userId) ?? null : null;
}

function requireUser(req, res) {
  const user = authenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { message: "登录已过期，请重新登录" });
    return null;
  }
  return user;
}

function normalizeTaskInput(body, existing = {}) {
  const now = new Date().toISOString();
  return {
    ...existing,
    title:
      body.title !== undefined ? String(body.title).trim() : existing.title,
    deadline:
      body.deadline !== undefined
        ? body.deadline == null
          ? null
          : String(body.deadline)
        : (existing.deadline ?? null),
    action_card_id:
      body.actionCardId !== undefined
        ? body.actionCardId == null
          ? null
          : String(body.actionCardId)
        : (existing.action_card_id ?? null),
    steps:
      body.steps !== undefined
        ? Array.isArray(body.steps)
          ? body.steps
          : []
        : (existing.steps ?? []),
    materials:
      body.materials !== undefined
        ? Array.isArray(body.materials)
          ? body.materials
          : []
        : (existing.materials ?? []),
    completed:
      body.completed !== undefined
        ? Boolean(body.completed)
        : (existing.completed ?? false),
    created_at: existing.created_at ?? now,
    updated_at: now,
  };
}

function taskList(userId) {
  return [...tasks.values()]
    .filter((task) => task.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method || "GET";

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS",
  );
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (method === "OPTIONS") {
    sendJson(res, 204);
    return;
  }

  try {
    if (method === "POST" && path === "/api/auth/register") {
      const body = await readJson(req);
      const username = String(body.username ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        sendJson(res, 400, {
          message: "用户名需为 3-20 位小写字母、数字或下划线",
        });
        return;
      }
      if (password.length < 6) {
        sendJson(res, 400, { message: "密码至少需要 6 位" });
        return;
      }
      if (users.has(username)) {
        sendJson(res, 400, { message: "用户名已被占用" });
        return;
      }
      const user = {
        id: randomUUID(),
        username,
        password,
        email: `${username}@cuc.local`,
        role: "student",
        first_name: String(body.displayName ?? "").trim() || username,
      };
      users.set(username, user);
      usersById.set(user.id, user);
      sendJson(res, 201, sessionResponse(user));
      return;
    }

    if (method === "POST" && path === "/api/auth/login") {
      const body = await readJson(req);
      const username = String(body.username ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const user = users.get(username);
      if (!user || user.password !== password) {
        sendJson(res, 401, { message: "用户名或密码错误" });
        return;
      }
      sendJson(res, 200, sessionResponse(user));
      return;
    }

    if (method === "GET" && path === "/api/auth/me") {
      const user = requireUser(req, res);
      if (!user) return;
      sendJson(res, 200, publicUser(user));
      return;
    }

    if (method === "GET" && path === "/api/freshness/summary") {
      sendJson(res, 200, freshness);
      return;
    }

    if (method === "GET" && path === "/api/tasks") {
      const user = requireUser(req, res);
      if (!user) return;
      sendJson(res, 200, taskList(user.id));
      return;
    }

    if (method === "POST" && path === "/api/tasks") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readJson(req);
      const title = String(body.title ?? "").trim();
      if (!title) {
        sendJson(res, 400, { message: "title 不能为空" });
        return;
      }
      const now = new Date().toISOString();
      const task = {
        id: `task-${nextTaskSequence++}`,
        user_id: user.id,
        ...normalizeTaskInput(
          { ...body, title },
          {
            created_at: now,
            updated_at: now,
            completed: false,
          },
        ),
      };
      tasks.set(task.id, task);
      sendJson(res, 201, task);
      return;
    }

    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      const user = requireUser(req, res);
      if (!user) return;
      const taskId = decodeURIComponent(taskMatch[1]);
      const existing = tasks.get(taskId);
      if (!existing || existing.user_id !== user.id) {
        sendJson(res, 404, { message: "任务不存在" });
        return;
      }

      if (method === "PUT") {
        const body = await readJson(req);
        const task = normalizeTaskInput(body, existing);
        tasks.set(taskId, task);
        sendJson(res, 200, task);
        return;
      }
      if (method === "DELETE") {
        tasks.delete(taskId);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (method === "POST" && path === "/api/chat") {
      await readJson(req);
      sendJson(res, 200, {
        status: "conflict",
        answer: "官网两个页面给出的号码不一致。",
        sources: [
          {
            title: "教务处 学籍管理",
            url: "https://jwc.cuc.edu.cn/jwcyx/list.htm",
            publish_date: null,
            evidence_level: "A",
          },
        ],
        notice: "请向主管部门核实",
        conflicts: [
          {
            label: "教务处页面",
            value: "65783223",
            source: "教务处",
            source_url: "https://jwc.cuc.edu.cn/jwcyx/list.htm",
          },
          {
            label: "信息化处页面",
            value: "65773223",
            source: "信息化处",
            source_url: "https://its.cuc.edu.cn/xskyqblzn/list.htm",
          },
        ],
      });
      return;
    }

    if (
      method === "POST" &&
      path === "/api/integrations/feishu/task"
    ) {
      const body = await readJson(req);
      if (typeof body?.text !== "string") {
        sendJson(res, 400, {
          message: "请求体需要提供 text 字符串。",
        });
        return;
      }
      sendJson(res, 200, {
        ok: false,
        code: "not_configured",
        message: "测试后端未配置飞书 Webhook",
      });
      return;
    }

    const routes = {
      "/api/health": { ok: true },
      "/api/contacts": { items: [contact], total: 1 },
      "/api/processes": { items: [processRecord], total: 1 },
      "/api/notices": { items: [notice], total: 1 },
      "/api/faq": { items: [faq], total: 1 },
      "/api/service-hours": { items: [serviceHour], total: 1 },
      "/api/calendar": calendar,
    };
    if (method === "GET" && Object.hasOwn(routes, path)) {
      sendJson(res, 200, routes[path]);
      return;
    }

    sendJson(res, 404, { message: "接口不存在", path });
  } catch (error) {
    sendJson(res, error.status || 500, {
      message: error instanceof Error ? error.message : "服务器内部错误",
    });
  }
});

server.listen(PORT, () => {
  console.log(`C2/C3 假后端已启动: http://localhost:${PORT}`);
  console.log(
    "可用端点: auth register/login/me, tasks CRUD, freshness summary, content, chat, feishu",
  );
});
