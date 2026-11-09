const base = (process.env.API_BASE || "http://127.0.0.1:3901").replace(
  /\/+$/,
  "",
);
const suffix = `${Date.now().toString(36)}${Math.random()
  .toString(36)
  .slice(2, 7)}`;
const accountA = `a_${suffix}`.slice(0, 20);
const accountB = `b_${suffix}`.slice(0, 20);
const password = "pass123456";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let data = null;
  if (text) data = JSON.parse(text);
  return { response, data };
}

async function register(username) {
  const { response, data } = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      displayName: username,
    }),
  });
  assert(response.status === 201, `注册 ${username} 应返回 201`);
  assert(
    typeof data.access_token === "string" && data.access_token,
    "注册应返回 access_token",
  );
  assert(data.user?.username === username, "注册应返回 snake_case user");
  return data;
}

const preflight = await request("/api/tasks", { method: "OPTIONS" });
assert(preflight.response.status === 204, "OPTIONS 应返回 204");
assert(
  preflight.response.headers
    .get("access-control-allow-headers")
    ?.toLowerCase()
    .includes("authorization"),
  "CORS 必须允许 Authorization",
);

const sessionA = await register(accountA);
const duplicate = await request("/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: accountA, password }),
});
assert(duplicate.response.status === 400, "重复用户名应返回 400");

const wrongPassword = await request("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: accountA, password: "wrong-password" }),
});
assert(wrongPassword.response.status === 401, "错误密码应返回 401");

const me = await request("/api/auth/me", {
  headers: { Authorization: `Bearer ${sessionA.access_token}` },
});
assert(me.response.status === 200, "有效 token 应能读取 /me");
assert(me.data.id === sessionA.user.id, "/me 用户应与登录用户一致");

const unauthorized = await request("/api/tasks");
assert(unauthorized.response.status === 401, "无 token 读取任务应返回 401");

const created = await request("/api/tasks", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${sessionA.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    title: "补办学生证",
    deadline: "2026-11-10T09:00:00.000Z",
    actionCardId: "card-student-id",
    steps: [
      { id: "s1", text: "准备身份证", done: false },
      { id: "s2", text: "到事务大厅办理", done: false },
    ],
    materials: [
      { id: "m1", name: "身份证", required: true, done: false },
    ],
  }),
});
assert(created.response.status === 201, "创建任务应返回 201");
assert(created.data.user_id === sessionA.user.id, "任务应带 user_id");
assert(
  created.data.action_card_id === "card-student-id",
  "actionCardId 应转换为 snake_case",
);
assert(Array.isArray(created.data.steps), "任务 steps 应为数组");

const listA = await request("/api/tasks", {
  headers: { Authorization: `Bearer ${sessionA.access_token}` },
});
assert(listA.response.status === 200, "读取任务应返回 200");
assert(Array.isArray(listA.data), "任务列表必须是数组");
assert(listA.data.length === 1, "账号 A 应看到自己的 1 条任务");

const replacedSteps = [
  { id: "s1", text: "准备身份证", done: true },
  { id: "s2", text: "到事务大厅办理", done: false },
];
const updated = await request(`/api/tasks/${created.data.id}`, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${sessionA.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ steps: replacedSteps, completed: false }),
});
assert(updated.response.status === 200, "更新任务应返回 200");
assert(updated.data.steps[0].done === true, "steps 应整份替换");
assert(updated.data.title === "补办学生证", "部分更新不应清空 title");

const sessionB = await register(accountB);
const listB = await request("/api/tasks", {
  headers: { Authorization: `Bearer ${sessionB.access_token}` },
});
assert(listB.response.status === 200, "账号 B 读取任务应返回 200");
assert(listB.data.length === 0, "账号 B 不应看到账号 A 的任务");

const crossAccountDelete = await request(`/api/tasks/${created.data.id}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${sessionB.access_token}` },
});
assert(
  crossAccountDelete.response.status === 404,
  "跨账号操作任务应返回 404",
);

const freshness = await request("/api/freshness/summary");
assert(freshness.response.status === 200, "新鲜度接口应返回 200");
assert(
  freshness.data.total === 22 &&
    freshness.data.current === 14 &&
    freshness.data.stale === 3 &&
    freshness.data.expired === 2 &&
    freshness.data.pending === 3 &&
    freshness.data.threshold_days === 90,
  "新鲜度主字段应与后端返回值一致",
);
assert(
  Array.isArray(freshness.data.by_table) &&
    freshness.data.by_table.length === 5,
  "新鲜度 by_table 应完整返回",
);

const feishuPush = await request("/api/integrations/feishu/task", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "【补办学生证】群内短问句：补办学生证" }),
});
assert(feishuPush.response.status === 200, "飞书推送路由应返回 200");
assert(feishuPush.data.ok === false, "未配置 Webhook 时不应声称发送成功");
assert(
  feishuPush.data.code === "not_configured",
  "未配置 Webhook 时应返回 not_configured",
);

const feishuMissingText = await request("/api/integrations/feishu/task", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
assert(
  feishuMissingText.response.status === 400,
  "飞书推送缺少 text 时应返回 400",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      accountA,
      accountB,
      taskId: created.data.id,
      checks: [
        "CORS preflight",
        "register/login/me",
        "duplicate and wrong password",
        "task CRUD and snake_case response",
        "full steps replacement",
        "account isolation",
        "freshness summary",
        "feishu task route and failure states",
      ],
    },
    null,
    2,
  ),
);
