import { useEffect, useState } from "react";
import { useStore } from "./store/useStore";
import { gdrivePull, syncStatus } from "./lib/api";
import { VaultGate } from "./components/VaultGate";
import { Sidebar } from "./components/Sidebar";
import { Workspace } from "./components/Workspace";
import { TitleBar } from "./components/TitleBar";
import { UpdateToast } from "./components/UpdateToast";

export default function App() {
  const status = useStore((s) => s.status);
  const refreshStatus = useStore((s) => s.refreshStatus);
  const setGdriveConnected = useStore((s) => s.setGdriveConnected);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await syncStatus();
        setGdriveConnected(s.gdriveConnected);
        // pull the latest encrypted vault from Drive before unlocking
        if (s.gdriveConnected) {
          await gdrivePull().catch(() => {});
        }
      } catch {
        /* ignore */
      }
      await refreshStatus();
      setBooted(true);
    })();
  }, [refreshStatus, setGdriveConnected]);

  if (!booted) {
    return (
      <div className="flex h-full items-center justify-center bg-bg text-content-muted">
        <span className="font-mono text-sm">Loading…</span>
      </div>
    );
  }

  const unlocked = status?.unlocked;

  return (
    <div className="flex h-full flex-col bg-bg text-content">
      <TitleBar />
      {!unlocked ? (
        <VaultGate />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <Workspace />
        </div>
      )}
      <UpdateToast />
    </div>
  );
}
