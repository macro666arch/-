/**
 * 本地 mock 问答引擎的入口（供测试脚本使用）
 * 直接复用 src/lib/mock/chat.ts —— 测的就是线上那份，不另抄。
 */
import "./register-alias.mjs";
const mod = await import("../src/lib/mock/chat.ts");
export const mockChat = mod.mockChat;
export const demoQuestions = mod.demoQuestions;
export const searchContacts = mod.searchContacts;
