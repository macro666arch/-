"use client";

import { useEffect, useState } from "react";
import {
  fetchCalendar,
  fetchContacts,
  fetchFaqs,
  fetchNotices,
  fetchPolicies,
  fetchProcesses,
  fetchServiceHours,
  isMock,
  type DataSource,
} from "@/lib/api";
import type { Calendar, Contact, Faq, Notice, Policy, Process, ServiceHour } from "@/lib/contract";

/**
 * 取数 hook
 * ------------------------------------------------------------
 * 设计要点：**先用 mock 立刻渲染，再去请求后端**。
 *
 * 为什么不直接 await 后端：
 *   ① 第一帧就有内容，不会白屏、不会有骨架屏闪烁（录视频不能有这个）
 *   ② 后端挂了页面照常可用，只是数据停在 mock
 *   ③ `NEXT_PUBLIC_USE_MOCK=true` 时根本不发请求，答辩断网也不怕
 *
 * 返回的 `source` 给页面显示数据来源徽章：
 *   mock     = 本地知识库（没开后端）
 *   live     = 后端实时接口
 *   fallback = 开了后端但请求失败，已退回本地
 */

export interface UseDataResult<T> {
  data: T;
  source: DataSource;
  /** fallback 时的错误原因，便于联调定位 */
  error?: string;
  /** 首次 live 请求进行中。用于让界面说明「为什么数字会变」 */
  syncing: boolean;
}

function useLiveList<T>(
  initial: T,
  fetcher: () => Promise<{ data: T; source: DataSource; error?: string }>,
): UseDataResult<T> {
  const [state, setState] = useState<UseDataResult<T>>({
    data: initial,
    source: "mock",
    syncing: false,
  });

  useEffect(() => {
    // 明确走 mock 时不发请求：少一次无意义的失败请求和 4 秒等待
    if (isMock) return;
    let alive = true;
    // 标记「正在同步」：首屏是本地数据，切换后端时数字会变，
    // 不解释一下会让人以为页面在抖。
    setState((s) => ({ ...s, syncing: true }));
    fetcher().then((r) => {
      if (alive) setState({ data: r.data, source: r.source, error: r.error, syncing: false });
    });
    return () => {
      alive = false;
    };
    // fetcher 是模块级常量函数，依赖稳定，不需要进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

export const useContacts = (initial: Contact[]) =>
  useLiveList(initial, fetchContacts);

export const useProcesses = (initial: Process[]) =>
  useLiveList(initial, fetchProcesses);

export const useNotices = (initial: Notice[]) =>
  useLiveList(initial, fetchNotices);

export const useServiceHours = (initial: ServiceHour[]) =>
  useLiveList(initial, fetchServiceHours);

export const useCalendars = (initial: Calendar[]) =>
  useLiveList(initial, fetchCalendar);

export const usePolicies = (initial: Policy[]) =>
  useLiveList(initial, fetchPolicies);

export const useFaqs = (initial: Faq[]) => useLiveList(initial, fetchFaqs);
