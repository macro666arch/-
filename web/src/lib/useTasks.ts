"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";
import {
  importLocalTasks,
  loadTasks,
  TASKS_CHANGED_EVENT,
  type CampusTask,
  type ImportLocalResult,
  type TaskDataSource,
} from "@/lib/tasks";

export interface UseTasksResult {
  tasks: CampusTask[];
  ready: boolean;
  loading: boolean;
  source: TaskDataSource;
  error: string;
  localCount: number;
  legacyCount: number;
  importLocal: () => Promise<ImportLocalResult>;
  refresh: () => Promise<void>;
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<CampusTask[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<TaskDataSource>("local");
  const [error, setError] = useState("");
  const [localCount, setLocalCount] = useState(0);
  const [legacyCount, setLegacyCount] = useState(0);
  const requestId = useRef(0);
  const active = useRef(true);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const result = await loadTasks();
      if (!active.current || currentRequest !== requestId.current) return;
      setTasks(result.tasks);
      setSource(result.source);
      setError(result.error ?? "");
      setLocalCount(result.localCount);
      setLegacyCount(result.legacyCount);
    } catch (requestError) {
      if (!active.current || currentRequest !== requestId.current) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "任务读取失败，请稍后重试",
      );
    } finally {
      if (active.current && currentRequest === requestId.current) {
        setLoading(false);
        setReady(true);
      }
    }
  }, []);

  const importLocal = useCallback(async () => {
    const result = await importLocalTasks();
    await refresh();
    return result;
  }, [refresh]);

  useEffect(() => {
    active.current = true;
    void refresh();

    const onChange = () => void refresh();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === "nau_token" ||
        event.key === "nau_user" ||
        event.key === "nau_tasks_local" ||
        event.key === "nau_tasks" ||
        event.key === "cuc-campus-tasks-v1"
      ) {
        void refresh();
      }
    };

    window.addEventListener(TASKS_CHANGED_EVENT, onChange);
    window.addEventListener(AUTH_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      active.current = false;
      window.removeEventListener(TASKS_CHANGED_EVENT, onChange);
      window.removeEventListener(AUTH_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  return {
    tasks,
    ready,
    loading,
    source,
    error,
    localCount,
    legacyCount,
    importLocal,
    refresh,
  };
}
