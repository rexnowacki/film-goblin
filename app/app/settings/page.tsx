import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import SettingsForm from "./SettingsForm";

export default function SettingsPage() {
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="settings" />
      <BottomNav current="settings" />
      <div className="container-wide" style={{ padding: 40 }}>
        <h1 className="h-display" style={{ marginBottom: 24 }}>Settings</h1>
        <SettingsForm />
      </div>
    </div>
  );
}
