import type {
  ActionCard,
  ActionCardMaterial,
  ActionCardStep,
  Notice,
  Process,
} from "@/lib/contract";
import { materialStableId } from "@/lib/materials";
import {
  getStoredUser,
  getToken,
  handleTaskUnauthorized,
} from "@/lib/auth";
import { ApiError, apiFetch, readableError } from "@/lib/http";

/** C2 协议规定的本地任务 key。 */
export const TASKS_LOCAL_STORAGE_KEY = "nau_tasks_local";
/** 旧版前端和协议迁移来源；只读，不再作为新数据主存储。 */
export const TASKS_STORAGE_KEY = "cuc-campus-tasks-v1";
export const LEGACY_TASKS_STORAGE_KEYS = ["nau_tasks", TASKS_STORAGE_KEY] as const;
export const TASKS_MIGRATED_KEY = "nau_tasks_migrated";
export const TASKS_CHANGED_EVENT = "cuc-campus-tasks-changed";
export const TASK_MEMBERS = ["甲", "乙", "丙", "丁"] as const;
export const DEFAULT_TASK_OWNER = "丙";
const LOCAL_USER_ID = "local-browser";
const TASK_META_STEP_ID = "__cuc_task_meta_v1__";
const TASK_META_PREFIX = "__CUC_TASK_META_V1__:";

export type TaskActivityKind =
  | "created"
  | "step"
  | "material"
  | "owner"
  | "collaborator"
  | "handoff"
  | "feishu"
  | "note";

export interface TaskActivity {
  id: string;
  at: string;
  kind: TaskActivityKind;
  text: string;
}

export interface CampusTask extends ActionCard {
  task_id: string;
  created_at: string;
  updated_at: string;
  completed_step_ids: string[];
  owner: string;
  collaborators: string[];
  completed_material_ids: string[];
  handoff_note: string;
  activities: TaskActivity[];
}

type PendingSync = "create" | "update" | "delete";

type StoredCampusTask = CampusTask & {
  _user_id?: string;
  _pending_sync?: PendingSync;
};

interface ApiTaskStep {
  id: string;
  text?: string;
  done?: boolean;
  [key: string]: unknown;
}

interface ApiTaskMaterial {
  id: string;
  name: string;
  required?: boolean;
  done?: boolean;
  [key: string]: unknown;
}

interface ApiTaskRecord {
  id?: unknown;
  user_id?: unknown;
  action_card_id?: unknown;
  title?: unknown;
  deadline?: unknown;
  steps?: unknown;
  materials?: unknown;
  completed?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  [key: string]: unknown;
}

interface TaskMetadata {
  version: 1;
  task: CampusTask;
  pending?: PendingSync;
}

interface ApiTaskRequest {
  title: string;
  deadline: string | null;
  actionCardId: string;
  steps: ApiTaskStep[];
  materials: ApiTaskMaterial[];
  completed?: boolean;
}

export type TaskDataSource = "live" | "local";

export interface TaskLoadResult {
  tasks: CampusTask[];
  source: TaskDataSource;
  error?: string;
  localCount: number;
  legacyCount: number;
}

export interface TaskMutationResult {
  task?: CampusTask;
  source: TaskDataSource;
  error?: string;
}

export interface ImportLocalResult {
  imported: number;
  failed: number;
  error?: string;
}

export function taskMatchesCard(
  task: Pick<CampusTask, "id" | "task_id">,
  cardId: string,
): boolean {
  return task.id === cardId || task.task_id === cardId;
}

export function taskMutationMessage(
  result: TaskMutationResult,
  success: string,
  options?: {
    live?: string;
    local?: string;
    offline?: string;
  },
): string {
  if (result.source === "live") {
    return options?.live ?? `${success}，已同步到账号`;
  }
  if (result.error) {
    return (
      options?.offline ??
      `${success}，已保存在本地；后端恢复后可在任务页导入（${result.error}）`
    );
  }
  return options?.local ?? `${success}，已保存在本地，登录后可导入账号`;
}

let currentSnapshot: StoredCampusTask[] = [];
let snapshotReady = false;
let currentSource: TaskDataSource = "local";

export type DeadlineTone = "overdue" | "urgent" | "soon" | "normal" | "unknown";

export interface DeadlineInfo {
  iso?: string;
  label: string;
  tone: DeadlineTone;
  remaining_ms?: number;
}

function storageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isTask(value: unknown): value is CampusTask {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CampusTask>;
  return (
    typeof item.task_id === "string" &&
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    Array.isArray(item.steps)
  );
}

function activityId(): string {
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newActivity(kind: TaskActivityKind, text: string): TaskActivity {
  return {
    id: activityId(),
    at: new Date().toISOString(),
    kind,
    text,
  };
}

/** 旧版任务没有协作者、材料勾选或活动记录，读取时无损补默认值。 */
function normalizeTask(value: CampusTask): CampusTask {
  const createdAt = value.created_at || new Date().toISOString();
  const owner =
    typeof value.owner === "string" &&
    TASK_MEMBERS.includes(value.owner as (typeof TASK_MEMBERS)[number])
      ? value.owner
      : DEFAULT_TASK_OWNER;
  return {
    ...value,
    owner,
    collaborators: Array.isArray(value.collaborators)
      ? value.collaborators.filter(
          (member): member is string =>
            typeof member === "string" &&
            member !== owner &&
            TASK_MEMBERS.includes(member as (typeof TASK_MEMBERS)[number]),
        )
      : [],
    completed_material_ids: Array.isArray(value.completed_material_ids)
      ? value.completed_material_ids.filter(
          (materialId): materialId is string => typeof materialId === "string",
        )
      : [],
    handoff_note: typeof value.handoff_note === "string" ? value.handoff_note : "",
    activities: Array.isArray(value.activities)
      ? value.activities
          .filter(
            (activity): activity is TaskActivity =>
              !!activity &&
              typeof activity === "object" &&
              typeof activity.id === "string" &&
              typeof activity.at === "string" &&
              typeof activity.text === "string",
          )
          .slice(0, 30)
      : [
          {
            id: `migrated-${value.task_id}`,
            at: createdAt,
            kind: "created",
            text: "任务已在本机创建（旧数据已兼容迁移）",
          },
        ],
  };
}

function setSnapshot(tasks: CampusTask[], source: TaskDataSource): void {
  currentSnapshot = tasks as StoredCampusTask[];
  currentSource = source;
  snapshotReady = true;
}

export function getTaskSnapshot(): CampusTask[] {
  return currentSnapshot;
}

export function getTaskDataSource(): TaskDataSource {
  return currentSource;
}

export function taskSnapshotReady(): boolean {
  return snapshotReady;
}

function parseMetadata(step: ApiTaskStep | undefined): TaskMetadata | undefined {
  if (!step || step.id !== TASK_META_STEP_ID || typeof step.text !== "string") {
    return undefined;
  }
  if (!step.text.startsWith(TASK_META_PREFIX)) return undefined;
  try {
    const data = JSON.parse(step.text.slice(TASK_META_PREFIX.length)) as TaskMetadata;
    if (data?.version === 1 && isTask(data.task)) return data;
  } catch {
    return undefined;
  }
  return undefined;
}

function asStep(value: unknown): ApiTaskStep | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string") return undefined;
  return item as ApiTaskStep;
}

function asMaterial(value: unknown): ApiTaskMaterial | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.name !== "string") return undefined;
  return item as ApiTaskMaterial;
}

function localDateTime(iso: string | null): string {
  if (!iso) return "截止时间待核实";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * The protocol deliberately lets steps/materials remain extensible JSON. The app
 * stores a hidden metadata step so rich action-card fields survive a server round
 * trip without asking the backend to add a second DTO.
 */
function taskForMetadata(task: CampusTask): CampusTask {
  const stored = task as StoredCampusTask;
  const { _user_id, _pending_sync, ...publicTask } = stored;
  return publicTask;
}

function taskWireContent(
  task: CampusTask,
  pending?: PendingSync,
): Omit<ApiTaskRequest, "actionCardId"> {
  const doneSteps = new Set(task.completed_step_ids);
  const doneMaterials = new Set(task.completed_material_ids);
  const deadline =
    task.deadline?.iso ?? taskDeadlineDate(task)?.toISOString() ?? null;
  const metadata: TaskMetadata = {
    version: 1,
    task: taskForMetadata(task),
    ...(pending ? { pending } : {}),
  };
  const visibleSteps = task.steps.map((step) => ({
    ...step,
    done: doneSteps.has(step.id),
  }));
  const allStepsDone =
    visibleSteps.length > 0 && visibleSteps.every((step) => step.done);

  return {
    title: task.title,
    deadline,
    steps: [
      {
        id: TASK_META_STEP_ID,
        text: `${TASK_META_PREFIX}${JSON.stringify(metadata)}`,
        done: true,
        kind: "campus_metadata",
      },
      ...visibleSteps,
    ],
    materials: task.materials.map((material, index) => ({
      ...material,
      id: materialStableId(material, index),
      done: doneMaterials.has(materialStableId(material, index)),
    })),
    completed: allStepsDone,
  };
}

/** POST /api/tasks only accepts the camelCase fields defined by C2. */
function toApiTaskCreate(task: CampusTask): ApiTaskRequest {
  const content = taskWireContent(task);
  return {
    title: content.title,
    deadline: content.deadline,
    actionCardId: task.id,
    steps: content.steps,
    materials: content.materials,
  };
}

/** PUT /api/tasks/:id never sends ids, ownership or server timestamps. */
function toApiTaskUpdate(task: CampusTask): ApiTaskRequest {
  const content = taskWireContent(task);
  return {
    title: content.title,
    deadline: content.deadline,
    actionCardId: task.id,
    steps: content.steps,
    materials: content.materials,
    completed: content.completed,
  };
}

/** Local storage keeps a server-shaped snapshot plus sync metadata. */
function toLocalTaskRecord(
  task: CampusTask,
  userId: string,
  pending: PendingSync,
): ApiTaskRecord {
  const content = taskWireContent(task, pending);
  return {
    id: task.task_id,
    user_id: userId,
    action_card_id: task.id,
    title: content.title,
    deadline: content.deadline,
    steps: content.steps,
    materials: content.materials,
    completed: content.completed,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}

function decodeApiTask(value: unknown): StoredCampusTask | null {
  if (!value || typeof value !== "object") return null;
  const record = value as ApiTaskRecord;
  const id = typeof record.id === "string" ? record.id : "";
  if (!id) return null;

  const rawSteps = Array.isArray(record.steps)
    ? record.steps.map(asStep).filter((item): item is ApiTaskStep => !!item)
    : [];
  const metadata = parseMetadata(
    rawSteps.find((step) => step.id === TASK_META_STEP_ID),
  );
  const base = metadata?.task && isTask(metadata.task)
    ? normalizeTask(metadata.task)
    : undefined;
  const visibleSteps = rawSteps.filter((step) => step.id !== TASK_META_STEP_ID);
  const steps: ActionCardStep[] = (visibleSteps.length
    ? visibleSteps.map((step) => ({
        id: step.id,
        text: step.text ?? String(step.id),
        ...(typeof step.detail === "string" ? { detail: step.detail } : {}),
        origin: step.origin === "official" ? "official" : "derived",
      }))
    : base?.steps) ?? [];

  const rawMaterials = Array.isArray(record.materials)
    ? record.materials
        .map(asMaterial)
        .filter((item): item is ApiTaskMaterial => !!item)
    : [];
  const materials: ActionCardMaterial[] = (rawMaterials.length
    ? rawMaterials.map((material) => ({
        id: material.id,
        name: material.name ?? material.id,
        ...(typeof material.required === "boolean"
          ? { required: material.required }
          : {}),
        ...(typeof material.spec === "string" ? { spec: material.spec } : {}),
        ...(typeof material.download_url === "string"
          ? { download_url: material.download_url }
          : {}),
        ...(material.origin === "official" ||
        material.origin === "derived" ||
        material.origin === "verify"
          ? { origin: material.origin }
          : {}),
        ...(material.submission === "online" ||
        material.submission === "onsite" ||
        material.submission === "mail" ||
        material.submission === "unknown"
          ? { submission: material.submission }
          : {}),
        ...(typeof material.note === "string" ? { note: material.note } : {}),
      }))
    : base?.materials) ?? [];

  const completedStepIds = new Set(base?.completed_step_ids ?? []);
  for (const step of visibleSteps) {
    if (typeof step.done !== "boolean") continue;
    if (step.done) completedStepIds.add(step.id);
    else completedStepIds.delete(step.id);
  }

  const completedMaterialIds = new Set(base?.completed_material_ids ?? []);
  for (const [index, material] of rawMaterials.entries()) {
    if (typeof material.done !== "boolean") continue;
    const materialId = materialStableId(material, index);
    if (material.done) completedMaterialIds.add(materialId);
    else completedMaterialIds.delete(materialId);
  }

  const deadlineIso =
    typeof record.deadline === "string" ? record.deadline : undefined;
  const fallbackId =
    (typeof record.action_card_id === "string" && record.action_card_id) || id;
  const now = new Date().toISOString();
  const title =
    typeof record.title === "string" && record.title.trim()
      ? record.title
      : base?.title ?? "未命名任务";
  const fallback: CampusTask = {
    id: fallbackId,
    source_type: "process",
    source_id: fallbackId,
    title,
    summary: "云端任务",
    department: {},
    ...(deadlineIso
      ? {
          deadline: {
            text: localDateTime(deadlineIso),
            iso: deadlineIso,
            source_url: "https://www.cuc.edu.cn/",
          },
        }
      : {}),
    materials,
    steps,
    missing_fields: [],
    verification: {
      verify_status: "待核实",
      effective_status: "待核实",
      gaps: [],
      source_url: "https://www.cuc.edu.cn/",
    },
    task_id: id,
    created_at:
      typeof record.created_at === "string"
        ? record.created_at
        : base?.created_at ?? now,
    updated_at:
      typeof record.updated_at === "string"
        ? record.updated_at
        : base?.updated_at ?? now,
    completed_step_ids: [...completedStepIds],
    owner: base?.owner ?? DEFAULT_TASK_OWNER,
    collaborators: base?.collaborators ?? [],
    completed_material_ids: [...completedMaterialIds],
    handoff_note: base?.handoff_note ?? "",
    activities: base?.activities ?? [newActivity("created", "任务已从账号载入")],
  };

  return {
    ...fallback,
    ...(base ?? {}),
    id: base?.id ?? fallbackId,
    task_id: id,
    title,
    ...(deadlineIso
      ? {
          deadline: {
            text: base?.deadline?.text ?? localDateTime(deadlineIso),
            iso: deadlineIso,
            source_url:
              base?.deadline?.source_url ?? "https://www.cuc.edu.cn/",
          },
        }
      : {}),
    steps,
    materials,
    created_at: fallback.created_at,
    updated_at: fallback.updated_at,
    completed_step_ids: [...completedStepIds],
    completed_material_ids: [...completedMaterialIds],
    _user_id:
      typeof record.user_id === "string"
        ? record.user_id
        : (base as StoredCampusTask | undefined)?._user_id,
    _pending_sync: metadata?.pending,
  };
}

function readArray(key: string): unknown[] {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalStorageTasks(): StoredCampusTask[] {
  return readArray(TASKS_LOCAL_STORAGE_KEY).flatMap((value) => {
    if (isTask(value)) {
      const task = normalizeTask(value) as StoredCampusTask;
      task._pending_sync = task._pending_sync ?? "create";
      return [task];
    }
    const decoded = decodeApiTask(value);
    return decoded ? [decoded] : [];
  });
}

function legacyMigrationPending(): boolean {
  if (!storageAvailable()) return false;
  return window.localStorage.getItem(TASKS_MIGRATED_KEY) !== "1";
}

function readLegacyTasks(): StoredCampusTask[] {
  if (!legacyMigrationPending()) return [];
  return LEGACY_TASKS_STORAGE_KEYS.flatMap((key) =>
    readArray(key).flatMap((value) => {
      if (isTask(value)) {
        const task = normalizeTask(value) as StoredCampusTask;
        task._pending_sync = "create";
        return [task];
      }
      const decoded = decodeApiTask(value);
      if (decoded) decoded._pending_sync = "create";
      return decoded ? [decoded] : [];
    }),
  );
}

function dedupeTasks(tasks: StoredCampusTask[]): StoredCampusTask[] {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = taskStorageIdentity(task);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function taskStorageIdentity(
  task: Pick<StoredCampusTask, "task_id" | "id" | "_user_id">,
): string {
  return `${task._user_id ?? LOCAL_USER_ID}:${task.task_id}:${task.id}`;
}

function readPendingLocalTasks(userId?: string): StoredCampusTask[] {
  const local = readLocalStorageTasks();
  const legacy = readLegacyTasks();
  const scoped = dedupeTasks([...local, ...legacy]).filter((task) => {
    const owner = task._user_id ?? LOCAL_USER_ID;
    if (!userId) return owner === LOCAL_USER_ID;
    return owner === LOCAL_USER_ID || owner === userId;
  });
  return scoped;
}

function visibleLocalTasks(tasks: StoredCampusTask[]): StoredCampusTask[] {
  return tasks.filter((task) => task._pending_sync !== "delete");
}

function mergeRemoteWithPending(
  remote: StoredCampusTask[],
  pending: StoredCampusTask[],
): StoredCampusTask[] {
  const tombstones = new Set(
    pending
      .filter((task) => task._pending_sync === "delete")
      .map((task) => task.task_id),
  );
  const pendingById = new Map(
    visibleLocalTasks(pending).map((task) => [task.task_id, task]),
  );
  const merged = remote
    .filter((task) => !tombstones.has(task.task_id))
    .map((task) => pendingById.get(task.task_id) ?? task);
  const remoteIds = new Set(merged.map((task) => task.task_id));
  return [
    ...visibleLocalTasks(pending).filter((task) => !remoteIds.has(task.task_id)),
    ...merged,
  ];
}

function writeLocalTask(
  task: CampusTask,
  userId: string,
  pending: PendingSync,
): void {
  if (!storageAvailable()) return;
  const existing = readLocalStorageTasks().filter(
    (item) => item.task_id !== task.task_id && item.id !== task.id,
  );
  const wire = toLocalTaskRecord(task, userId, pending);
  window.localStorage.setItem(
    TASKS_LOCAL_STORAGE_KEY,
    JSON.stringify([
      ...existing.map((item) =>
        toLocalTaskRecord(
          item,
          item._user_id ?? userId,
          item._pending_sync ?? "create",
        ),
      ),
      wire,
    ]),
  );
}

function removeLocalTask(task: Pick<CampusTask, "task_id" | "id">): void {
  if (!storageAvailable()) return;
  for (const key of [TASKS_LOCAL_STORAGE_KEY, ...LEGACY_TASKS_STORAGE_KEYS]) {
    const remaining = readArray(key).filter((value) => {
      if (isTask(value)) {
        return value.task_id !== task.task_id && value.id !== task.id;
      }
      if (!value || typeof value !== "object") return true;
      const record = value as ApiTaskRecord;
      const recordId = typeof record.id === "string" ? record.id : "";
      const actionCardId =
        typeof record.action_card_id === "string" ? record.action_card_id : "";
      return recordId !== task.task_id && actionCardId !== task.id;
    });
    window.localStorage.setItem(key, JSON.stringify(remaining));
  }
}

function currentUserId(): string | null {
  return getStoredUser()?.id || null;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function shouldFallback(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 0 || error.status >= 500)
  );
}

function handleTaskError(error: unknown): never {
  if (error instanceof ApiError && error.status === 401) {
    handleTaskUnauthorized();
  }
  throw error;
}

async function listRemoteTasks(): Promise<StoredCampusTask[]> {
  const raw = await apiFetch<unknown>("/api/tasks", {
    headers: authHeaders(),
  });
  const values = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown[] }).items)
      ? (raw as { items: unknown[] }).items
      : null;
  if (!values) throw new ApiError("任务接口未返回数组");
  return values
    .map(decodeApiTask)
    .filter((task): task is StoredCampusTask => !!task);
}

async function createRemoteTask(
  task: CampusTask,
): Promise<StoredCampusTask> {
  const raw = await apiFetch<unknown>("/api/tasks", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(toApiTaskCreate(task)),
  });
  const decoded = decodeApiTask(raw);
  if (!decoded) throw new ApiError("创建成功但后端未返回任务");
  return decoded;
}

async function updateRemoteTask(
  task: CampusTask,
  userId: string,
): Promise<StoredCampusTask> {
  const raw = await apiFetch<unknown>(`/api/tasks/${encodeURIComponent(task.task_id)}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(toApiTaskUpdate(task)),
  });
  return decodeApiTask(raw) ?? ({
    ...task,
    _user_id: userId,
    _pending_sync: undefined,
  } as StoredCampusTask);
}

function emitTasksChanged(
  source: TaskDataSource = currentSource,
  error?: string,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TASKS_CHANGED_EVENT, {
      detail: { source, error },
    }),
  );
}

export function readTasks(): CampusTask[] {
  return visibleLocalTasks(
    readPendingLocalTasks(currentUserId() ?? undefined),
  );
}

export function notifyTasksChanged(): void {
  emitTasksChanged(currentSource);
}

export function isTaskPendingSync(task: CampusTask): boolean {
  return !!(task as StoredCampusTask)._pending_sync;
}

export async function loadTasks(): Promise<TaskLoadResult> {
  const token = getToken();
  const userId = currentUserId() ?? undefined;
  const pending = readPendingLocalTasks(userId);
  const currentLocalIds = new Set(
    readLocalStorageTasks().map((task) => taskStorageIdentity(task)),
  );
  const localCount = pending.filter((task) =>
    currentLocalIds.has(taskStorageIdentity(task)),
  ).length;
  const legacyCount = pending.length - localCount;

  if (!token) {
    const tasks = visibleLocalTasks(readPendingLocalTasks());
    setSnapshot(tasks, "local");
    return { tasks, source: "local", localCount, legacyCount };
  }

  try {
    const remote = await listRemoteTasks();
    const tasks = mergeRemoteWithPending(remote, pending);
    setSnapshot(tasks, "live");
    return { tasks, source: "live", localCount, legacyCount };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      handleTaskUnauthorized();
      setSnapshot([], "local");
      return {
        tasks: [],
        source: "local",
        error: "登录已过期，请重新登录",
        localCount,
        legacyCount,
      };
    }
    if (shouldFallback(error)) {
      const tasks = visibleLocalTasks(readPendingLocalTasks(userId));
      setSnapshot(tasks, "local");
      return {
        tasks,
        source: "local",
        error: `后端暂不可用，当前使用本地保存：${readableError(error)}`,
        localCount,
        legacyCount,
      };
    }
    throw error;
  }
}

export async function saveTask(card: ActionCard): Promise<TaskMutationResult> {
  const tasks = snapshotReady
    ? getTaskSnapshot()
    : await loadTasks().then((result) => result.tasks);
  const now = new Date().toISOString();
  const existing = tasks.find(
    (task) => task.id === card.id || task.task_id === card.id,
  );
  const saved: StoredCampusTask = {
    ...card,
    task_id: existing?.task_id ?? `local-${Date.now()}`,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    completed_step_ids: existing?.completed_step_ids ?? [],
    owner: existing?.owner ?? DEFAULT_TASK_OWNER,
    collaborators: existing?.collaborators ?? [],
    completed_material_ids: existing?.completed_material_ids ?? [],
    handoff_note: existing?.handoff_note ?? "",
    activities: existing
      ? existing.activities
      : [newActivity("created", "从办事卡加入任务")],
  };
  const userId = currentUserId();
  const token = getToken();
  const pending: PendingSync =
    existing && !existing.task_id.startsWith("local-") ? "update" : "create";

  if (token && userId) {
    try {
      const remote =
        pending === "update"
          ? await updateRemoteTask(saved, userId)
          : await createRemoteTask(saved);
      const next = existing
        ? tasks.map((task) =>
            task.task_id === existing.task_id ? remote : task,
          )
        : [remote, ...tasks];
      removeLocalTask(saved);
      setSnapshot(next, "live");
      emitTasksChanged("live");
      return { task: remote, source: "live" };
    } catch (error) {
      if (!shouldFallback(error)) handleTaskError(error);
      const local = {
        ...saved,
        _user_id: userId,
        _pending_sync: pending,
      } as StoredCampusTask;
      writeLocalTask(local, userId, pending);
      const next = existing
        ? tasks.map((task) =>
            task.task_id === existing.task_id ? local : task,
          )
        : [local, ...tasks];
      setSnapshot(next, "local");
      emitTasksChanged("local", readableError(error));
      return {
        task: local,
        source: "local",
        error: readableError(error),
      };
    }
  }

  writeLocalTask(saved, LOCAL_USER_ID, pending);
  const next = existing
    ? tasks.map((task) =>
        task.task_id === existing.task_id ? saved : task,
      )
    : [saved, ...tasks];
  setSnapshot(next, "local");
  emitTasksChanged("local");
  return { task: saved, source: "local" };
}

async function mutateTask(
  taskId: string,
  updater: (task: CampusTask) => CampusTask,
): Promise<TaskMutationResult> {
  const tasks = snapshotReady
    ? getTaskSnapshot()
    : await loadTasks().then((result) => result.tasks);
  const existing = tasks.find((task) => task.task_id === taskId);
  if (!existing) throw new Error("任务不存在或已被删除");
  const updated = updater(existing);
  const userId = currentUserId();
  const token = getToken();

  if (!token || !userId || existing.task_id.startsWith("local-")) {
    const owner = (existing as StoredCampusTask)._user_id ?? userId ?? LOCAL_USER_ID;
    const pending: PendingSync =
      existing.task_id.startsWith("local-") ? "create" : "update";
    const local: StoredCampusTask = {
      ...updated,
      _user_id: owner,
      _pending_sync: pending,
    };
    writeLocalTask(local, owner, pending);
    const next = tasks.map((task) =>
      task.task_id === taskId ? local : task,
    );
    setSnapshot(next, "local");
    emitTasksChanged("local");
    return { task: local, source: "local" };
  }

  try {
    const remote = await updateRemoteTask(updated, userId);
    removeLocalTask(updated);
    const next = tasks.map((task) =>
      task.task_id === taskId ? remote : task,
    );
    setSnapshot(next, "live");
    emitTasksChanged("live");
    return { task: remote, source: "live" };
  } catch (error) {
    if (!shouldFallback(error)) handleTaskError(error);
    const local: StoredCampusTask = {
      ...updated,
      _user_id: userId,
      _pending_sync: "update",
    };
    writeLocalTask(local, userId, "update");
    const next = tasks.map((task) =>
      task.task_id === taskId ? local : task,
    );
    setSnapshot(next, "local");
    emitTasksChanged("local", readableError(error));
    return {
      task: local,
      source: "local",
      error: readableError(error),
    };
  }
}

export async function removeTask(taskId: string): Promise<TaskMutationResult> {
  const tasks = snapshotReady
    ? getTaskSnapshot()
    : await loadTasks().then((result) => result.tasks);
  const existing = tasks.find((task) => task.task_id === taskId);
  if (!existing) return { source: currentSource };
  const token = getToken();
  const userId = currentUserId();
  const next = tasks.filter((task) => task.task_id !== taskId);

  if (!token || !userId || taskId.startsWith("local-")) {
    removeLocalTask(existing);
    setSnapshot(next, "local");
    emitTasksChanged("local");
    return { task: existing, source: "local" };
  }

  try {
    await apiFetch<unknown>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    removeLocalTask(existing);
    setSnapshot(next, "live");
    emitTasksChanged("live");
    return { task: existing, source: "live" };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      removeLocalTask(existing);
      setSnapshot(next, "live");
      emitTasksChanged("live");
      return { task: existing, source: "live" };
    }
    if (shouldFallback(error)) {
      const tombstone = {
        ...existing,
        _user_id: userId,
        _pending_sync: "delete",
      } as StoredCampusTask;
      writeLocalTask(tombstone, userId, "delete");
      setSnapshot(next, "local");
      emitTasksChanged("local", readableError(error));
      return {
        task: existing,
        source: "local",
        error: readableError(error),
      };
    }
    handleTaskError(error);
  }
}

export async function setTaskStepDone(
  taskId: string,
  stepId: string,
  done: boolean,
): Promise<TaskMutationResult> {
  const now = new Date().toISOString();
  return mutateTask(taskId, (task) => {
    const ids = new Set(task.completed_step_ids);
    if (done) ids.add(stepId);
    else ids.delete(stepId);
    return {
      ...task,
      completed_step_ids: [...ids],
      updated_at: now,
      activities: [
        newActivity(
          "step",
          `${done ? "完成" : "重新打开"}步骤「${
            task.steps.find((step) => step.id === stepId)?.text ?? stepId
          }」`,
        ),
        ...task.activities,
      ].slice(0, 30),
    };
  });
}

export async function setTaskMaterialDone(
  taskId: string,
  materialId: string,
  done: boolean,
): Promise<TaskMutationResult> {
  const now = new Date().toISOString();
  return mutateTask(taskId, (task) => {
    const ids = new Set(task.completed_material_ids);
    if (done) ids.add(materialId);
    else ids.delete(materialId);
    const materialIndex = task.materials.findIndex(
      (material, index) => materialStableId(material, index) === materialId,
    );
    const materialName =
      task.materials[materialIndex]?.name ?? `材料 ${materialId}`;
    return {
      ...task,
      completed_material_ids: [...ids],
      updated_at: now,
      activities: [
        newActivity("material", `${done ? "备齐" : "取消勾选"}材料「${materialName}」`),
        ...task.activities,
      ].slice(0, 30),
    };
  });
}

export async function setTaskOwner(
  taskId: string,
  owner: string,
): Promise<TaskMutationResult> {
  const now = new Date().toISOString();
  return mutateTask(taskId, (task) => {
    if (task.owner === owner) return task;
    return {
      ...task,
      owner,
      collaborators: task.collaborators.filter((member) => member !== owner),
      updated_at: now,
      activities: [
        newActivity("owner", `负责人由「${task.owner}」改为「${owner}」`),
        ...task.activities,
      ].slice(0, 30),
    };
  });
}

export async function setTaskCollaborators(
  taskId: string,
  collaborators: string[],
): Promise<TaskMutationResult> {
  const now = new Date().toISOString();
  return mutateTask(taskId, (task) => {
    const unique = [...new Set(collaborators)].filter((member) => member !== task.owner);
    return {
      ...task,
      collaborators: unique,
      updated_at: now,
      activities: [
        newActivity(
          "collaborator",
          unique.length ? `协作者：${unique.join("、")}` : "已清空协作者",
        ),
        ...task.activities,
      ].slice(0, 30),
    };
  });
}

export async function setTaskHandoffNote(
  taskId: string,
  note: string,
): Promise<TaskMutationResult> {
  const now = new Date().toISOString();
  return mutateTask(taskId, (task) => {
    if (task.handoff_note === note) return task;
    return {
      ...task,
      handoff_note: note,
      updated_at: now,
      activities: [
        newActivity("handoff", note.trim() ? `交接说明：${note.trim()}` : "清空交接说明"),
        ...task.activities,
      ].slice(0, 30),
    };
  });
}

export async function addTaskActivity(
  taskId: string,
  kind: TaskActivityKind,
  text: string,
): Promise<TaskMutationResult> {
  const now = new Date().toISOString();
  return mutateTask(taskId, (task) => ({
    ...task,
    updated_at: now,
    activities: [newActivity(kind, text), ...task.activities].slice(0, 30),
  }));
}

export async function importLocalTasks(): Promise<ImportLocalResult> {
  const token = getToken();
  const userId = currentUserId();
  if (!token || !userId) {
    return { imported: 0, failed: 0, error: "登录后才能导入本地任务" };
  }

  const pendingTasks = readPendingLocalTasks(userId);
  if (!pendingTasks.length) {
    return { imported: 0, failed: 0 };
  }

  let imported = 0;
  let failed = 0;
  let lastError = "";
  for (const task of pendingTasks) {
    try {
      const operation =
        task._pending_sync ??
        (task.task_id.startsWith("local-") ? "create" : "update");
      if (operation === "create") {
        await createRemoteTask(task);
      } else if (operation === "delete") {
        try {
          await apiFetch<unknown>(
            `/api/tasks/${encodeURIComponent(task.task_id)}`,
            {
              method: "DELETE",
              headers: authHeaders(),
            },
          );
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) {
            throw error;
          }
        }
      } else {
        await updateRemoteTask(task, userId);
      }
      removeLocalTask(task);
      imported += 1;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleTaskUnauthorized();
        return {
          imported,
          failed: pendingTasks.length - imported,
          error: "登录已过期，请重新登录",
        };
      }
      failed += 1;
      lastError = readableError(error);
    }
  }

  if (failed === 0) {
    window.localStorage.setItem(TASKS_MIGRATED_KEY, "1");
  }
  await loadTasks();
  return {
    imported,
    failed,
    ...(lastError ? { error: lastError } : {}),
  };
}

export function taskProgress(task: CampusTask): number {
  if (!task.steps.length) return 0;
  const done = new Set(task.completed_step_ids);
  const complete = task.steps.filter((step) => done.has(step.id)).length;
  return Math.round((complete / task.steps.length) * 100);
}

export function taskMaterialProgress(task: CampusTask): { done: number; total: number } {
  const done = new Set(task.completed_material_ids);
  return {
    done: task.materials.filter((material, index) =>
      done.has(materialStableId(material, index)),
    ).length,
    total: task.materials.length,
  };
}

export function nextIncompleteStep(task: CampusTask) {
  const done = new Set(task.completed_step_ids);
  return task.steps.find((step) => !done.has(step.id));
}

function parseLastDate(text?: string): Date | undefined {
  if (!text) return undefined;
  const iso = new Date(text);
  if (Number.isFinite(iso.getTime())) return iso;

  const numeric =
    /(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?(?:\s*(\d{1,2})\s*[:：]\s*(\d{1,2}))?/g;
  const found: Array<{ y: string; m: string; d: string; h?: string; min?: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = numeric.exec(text))) {
    found.push({ y: match[1], m: match[2], d: match[3], h: match[4], min: match[5] });
  }
  const last = found.at(-1);
  if (!last) return undefined;
  return new Date(
    Number(last.y),
    Number(last.m) - 1,
    Number(last.d),
    last.h == null ? 23 : Number(last.h),
    last.min == null ? 59 : Number(last.min),
    0,
    0,
  );
}

export function taskDeadlineDate(task: Pick<CampusTask, "deadline">): Date | undefined {
  return parseLastDate(task.deadline?.iso) ?? parseLastDate(task.deadline?.text);
}

export function deadlineInfo(
  task: Pick<CampusTask, "deadline">,
  now = Date.now(),
): DeadlineInfo {
  const date = taskDeadlineDate(task);
  if (!date) {
    return {
      label: task.deadline?.text || "截止时间待核实",
      tone: "unknown",
    };
  }

  const remaining = date.getTime() - now;
  const abs = Math.abs(remaining);
  const days = Math.ceil(abs / 86_400_000);
  const hours = Math.ceil(abs / 3_600_000);

  if (remaining < 0) {
    return {
      iso: date.toISOString(),
      label: days <= 1 ? `已逾期 ${hours} 小时` : `已逾期 ${days} 天`,
      tone: "overdue",
      remaining_ms: remaining,
    };
  }
  if (remaining < 86_400_000) {
    return {
      iso: date.toISOString(),
      label: `剩 ${Math.max(1, hours)} 小时`,
      tone: "urgent",
      remaining_ms: remaining,
    };
  }
  if (remaining < 7 * 86_400_000) {
    return {
      iso: date.toISOString(),
      label: `剩 ${days} 天`,
      tone: "soon",
      remaining_ms: remaining,
    };
  }
  return {
    iso: date.toISOString(),
    label: `剩 ${days} 天`,
    tone: "normal",
    remaining_ms: remaining,
  };
}

export function processToActionCard(process: Process): ActionCard {
  const remedy = process.remedy?.trim();
  return {
    id: `process:${process.id}`,
    source_type: "process",
    source_id: process.id,
    title: process.process_name,
    summary: [process.applicable_to, process.conditions?.join("；")].filter(Boolean).join("；"),
    applicable_to: process.applicable_to,
    department: {
      name: process.dept_name ?? undefined,
      phone: process.phone ?? undefined,
      location: process.location_name ?? undefined,
      hours: process.service_hours ?? undefined,
      entry_url: process.entry_url ?? undefined,
      entry_status: process.entry_status ?? undefined,
    },
    deadline: process.deadline
      ? {
          text: process.deadline,
          iso: taskDeadlineDate({ deadline: { text: process.deadline, source_url: process.source_url } })?.toISOString(),
          source_url: process.source_url,
        }
      : undefined,
    materials: (process.required_materials ?? []).flatMap((name, index) => {
      const raw = name.trim();
      if (!raw || /^[（(].*(?:无需|不需要).*(?:纸质)?材料.*[）)]$/.test(raw)) {
        return [];
      }

      const uncertain =
        /官方未明确|待核实|可能需|部分情况|部分学院要求/.test(raw);
      const displayName = uncertain
        ? raw
            .replace(/^[（(]|[）)]$/g, "")
            .replace(/，?官方未明确.*$/u, "")
            .replace(/^部分情况需/u, "")
            .replace(/^可能需/u, "")
            .replace(/（部分学院要求）/u, "")
            .trim()
        : raw;

      return [
        {
          id: `process-${process.id}-material-${index + 1}`,
          name: displayName || raw,
          required: !uncertain,
          origin: uncertain ? "verify" : "official",
          submission: "unknown",
          note: uncertain
            ? `官网原文只提示“${raw}”，未形成确定的材料要求；办理前需向主管部门核实。`
            : undefined,
        } as const,
      ];
    }),
    steps: (process.steps ?? []).map((step) => ({
      id: `step-${step.step_no}`,
      text: step.action,
      detail: [
        step.responsible_role && `负责：${step.responsible_role}`,
        step.prerequisite && `前置：${step.prerequisite}`,
        step.deadline && `时限：${step.deadline}`,
        step.next_entry && `去向：${step.next_entry}`,
        step.gap_note,
      ]
        .filter(Boolean)
        .join(" · "),
      origin: "official",
    })),
    missing_fields: [
      !process.dept_name && "主管部门",
      !process.phone && "联系电话",
      !process.location_name && "办理地点",
      !process.deadline && "截止时间",
    ].filter(Boolean) as string[],
    remedy: remedy
      ? {
          available: true,
          text: remedy,
          channel: [process.dept_name, process.phone].filter(Boolean).join(" "),
        }
      : undefined,
    verification: {
      verify_status: process.verify_status,
      effective_status: process.effective_status,
      gaps: [...(process.gaps ?? []), ...(process.gap_summary ? [process.gap_summary] : [])],
      source_url: process.source_url,
    },
  };
}

export function noticeToActionCard(notice: Notice): ActionCard {
  const deadlineText = notice.deadline?.trim();
  const deadlineIso =
    deadlineText && !/待核实|未明确|未写明/.test(deadlineText)
      ? taskDeadlineDate({
          deadline: {
            text: deadlineText,
            source_url: notice.source_url,
          },
        })?.toISOString()
      : undefined;
  const entryUrl = notice.external_links?.find((link) => link.accessible !== false)?.url;
  const entryLabel =
    notice.external_links?.find((link) => link.accessible !== false)?.title ??
    notice.extracted_fields?.entry ??
    "官方入口";
  const usableAttachments = (notice.attachments ?? []).filter(
    (attachment) => attachment.status === "正常",
  );
  const brokenAttachments = (notice.attachments ?? []).filter(
    (attachment) => attachment.status !== "正常",
  );
  const steps: ActionCard["steps"] = [];

  if (entryUrl) {
    steps.push({
      id: "notice-entry",
      text: `进入${entryLabel}`,
      detail: entryUrl,
      origin: "official",
    });
  }

  if (notice.body_content) {
    steps.push({
      id: "notice-check",
      text: "按通知核对适用对象、时间节点和材料要求",
      detail: notice.body_content,
      origin: "derived",
    });
  }

  if (deadlineText && !/待核实|未明确|未写明/.test(deadlineText)) {
    steps.push({
      id: "notice-deadline",
      text: "在官方截止时间前完成提交或缴费，并留存成功凭证",
      detail: deadlineText,
      origin: "derived",
    });
  }

  const missingFields = [
    !deadlineText || /待核实|未明确|未写明/.test(deadlineText) ? "明确截止时间" : "",
    !notice.extracted_fields?.applicable_to && !notice.applicable_to ? "适用对象" : "",
    !entryUrl && !notice.extracted_fields?.entry ? "办理入口" : "",
    brokenAttachments.length ? "可正常下载的官方附件" : "",
  ].filter(Boolean) as string[];

  let remedy: ActionCard["remedy"];
  if (notice.notice_status === "已过截止") {
    remedy = {
      available: false,
      text:
        notice.id === "nt-04"
          ? "报名已截止，官方未公布补报名安排。可先查看报名系统中的自动候补状态，再联系本科生院教学运行中心 65779333 核实是否有后续处理。"
          : "该事项已过截止，官方原文未公布统一补救路径。请联系通知发布部门核实是否仍可补办或顺延。",
      channel: notice.publish_dept ?? notice.source,
    };
  } else if (brokenAttachments.length) {
    remedy = {
      available: false,
      text: "先联系发布部门索取可用的官方附件，不要使用空白或无法读取的文件。",
      channel: notice.publish_dept ?? notice.source,
    };
  }

  return {
    id: `notice:${notice.id}`,
    source_type: "notice",
    source_id: notice.id,
    title: notice.notice_name,
    summary: notice.body_content ?? notice.gap_summary ?? notice.notice_name,
    applicable_to: notice.extracted_fields?.applicable_to ?? notice.applicable_to ?? undefined,
    department: {
      name: notice.publish_dept ?? notice.source,
      phone: notice.id === "nt-04" ? "65779333" : undefined,
      entry_url: entryUrl,
      entry_status: entryUrl ? "打开官方入口" : undefined,
    },
    deadline:
      deadlineText && deadlineText !== "已截止"
        ? {
            text: deadlineText,
            iso: deadlineIso,
            source_url: notice.source_url,
          }
        : undefined,
    materials: (notice.attachments ?? []).map((attachment, index) => ({
      id: `notice-${notice.id}-material-${index + 1}`,
      name: attachment.name,
      required: true,
      origin: "official",
      submission: "unknown",
      spec:
        attachment.status === "正常"
          ? attachment.text_extracted
            ? "附件可读取"
            : "附件存在，正文未提取"
          : `附件状态：${attachment.status}`,
      download_url: attachment.status === "正常" ? attachment.url ?? undefined : undefined,
    })),
    steps,
    missing_fields: [
      ...missingFields,
      ...(usableAttachments.length === 0 && brokenAttachments.length
        ? ["附件内容无法核验"]
        : []),
    ],
    remedy,
    verification: {
      verify_status: notice.verify_status,
      effective_status: notice.effective_status,
      gaps: [...(notice.gaps ?? []), ...(notice.gap_summary ? [notice.gap_summary] : [])],
      source_url: notice.source_url,
    },
  };
}

/** 群机器人后续接入时使用的稳定短问句；当前先作为可复制模板展示。 */
export function taskGroupQuery(task: Pick<ActionCard, "title">): string {
  const query = task.title
    .replace(/[（(][^）)]{0,20}[）)]/g, "")
    .replace(/办事指南|办理指南|服务指南/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (query || task.title.trim() || "校园办事").slice(0, 24);
}

export function taskSummaryText(task: ActionCard | CampusTask): string {
  const campusTask =
    "owner" in task && "collaborators" in task ? (task as CampusTask) : undefined;
  const completedMaterials = new Set(campusTask?.completed_material_ids ?? []);
  const deadline = deadlineInfo(task);
  const deadlineText = task.deadline?.text
    ? `${task.deadline.text}${deadline.iso ? `（${deadline.label}）` : ""}`
    : "官方原文未明确";
  const visibleMaterials = task.materials.slice(0, 3);
  const hiddenMaterialCount = task.materials.length - visibleMaterials.length;
  const materialText = visibleMaterials
    .map((item, index) => {
      const id = materialStableId(item, index);
      const mark = completedMaterials.has(id) ? "✓" : "□";
      return `${mark}${item.name}`;
    })
    .join("、");
  const phoneLabel = task.verification.verify_status.includes("已核实")
    ? "核实电话"
    : "部门电话";
  const contactText = [
    task.department.name,
    task.department.phone
      ? `${phoneLabel} ${task.department.phone}`
      : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  const lines = [
    `【${task.title}】`,
    `截止：${deadlineText}`,
    contactText ? `联系：${contactText}` : "",
    task.department.location ? `地点：${task.department.location}` : "",
    campusTask
      ? `分工：${campusTask.owner} 负责${
          campusTask.collaborators.length
            ? `；${campusTask.collaborators.join("、")} 协作`
            : ""
        }`
      : "",
    materialText
      ? `材料：${materialText}${
          hiddenMaterialCount > 0 ? `，另有 ${hiddenMaterialCount} 项` : ""
        }`
      : "",
    "步骤：",
    ...task.steps.map((step, index) => `${index + 1}. ${step.text}`),
    campusTask?.handoff_note ? `交接说明：${campusTask.handoff_note}` : "",
    task.remedy?.text ? `如果错过：${task.remedy.text}` : "",
    `详情：${task.verification.source_url}`,
    `群内短问句：${taskGroupQuery(task)}`,
    "说明：以上为官网信息整理，不替代学校最终解释。",
  ];
  return lines.filter(Boolean).join("\n");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function icsDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildTaskIcs(task: ActionCard | CampusTask): string | undefined {
  const date = taskDeadlineDate(task);
  if (!date) return undefined;
  const end = new Date(date.getTime() + 30 * 60_000);
  const uid = `${task.id.replace(/[^a-zA-Z0-9_-]/g, "-")}@cuc-campus-assistant`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CUC Campus Assistant//Task Reminder//CN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(date)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeIcs(`截止：${task.title}`)}`,
    `DESCRIPTION:${escapeIcs(taskSummaryText(task))}`,
    `URL:${task.verification.source_url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT24H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs(`${task.title} 明天截止`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadTaskIcs(task: ActionCard | CampusTask): boolean {
  const content = buildTaskIcs(task);
  if (!content || typeof window === "undefined") return false;
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${task.title.replace(/[\\/:*?"<>|]/g, "-")}-截止提醒.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

export async function copyTaskSummary(task: ActionCard | CampusTask): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const text = taskSummaryText(task);

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through for browsers that expose Clipboard API but deny access.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}
