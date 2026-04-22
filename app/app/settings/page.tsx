import TopNav from "@/components/TopNav";
import SettingsForm from "./SettingsForm";

export default function SettingsPage() {
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="settings" />
      <div className="container-wide" style={{ padding: 40 }}>
        <h1 className="display" style={{ fontSize: 64, margin: "0 0 24px" }}>Settings</h1>
        <SettingsForm />
      </div>
    </div>
  );
}
