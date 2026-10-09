import ChatPanel from "@/components/ChatPanel";
import DashboardShell from "@/components/DashboardShell";

export default async function ChatSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DashboardShell>
      <ChatPanel sessionId={id} />
    </DashboardShell>
  );
}
