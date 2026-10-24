import ChatPanel from "@/components/ChatPanel";

export default async function ChatSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatPanel sessionId={id} />;
}
