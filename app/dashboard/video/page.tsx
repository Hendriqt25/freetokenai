import DashboardShell from "@/components/DashboardShell";
import MediaStudio from "@/components/MediaStudio";

export default function VideoPage() {
  return (
    <DashboardShell>
      <MediaStudio kind="video" />
    </DashboardShell>
  );
}
