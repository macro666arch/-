import ChatClient from "@/components/ChatClient";

export const metadata = {
  title: "智能问答 · 中传校园信息助手",
  description:
    "带来源、带冲突并列、带核实渠道的校园信息问答。答不出来就明确说答不出来。",
};

export default function ChatPage() {
  return <ChatClient />;
}
