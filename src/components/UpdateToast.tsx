import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, downloadAndApply, type UpdateProgress } from "../lib/updater";

export function UpdateToast() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  useEffect(() => {
    // check shortly after launch, then hourly
    const run = () => checkForUpdate().then((u) => u && setUpdate(u));
    const t = setTimeout(run, 3000);
    const i = setInterval(run, 60 * 60 * 1000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, []);

  if (!update || dismissed) return null;

  const pct =
    progress && progress.total ? Math.round((progress.downloaded / progress.total) * 100) : null;

  const install = async () => {
    setInstalling(true);
    try {
      await downloadAndApply(update, setProgress);
    } catch (e) {
      setInstalling(false);
      alert("Update failed: " + String(e));
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 animate-fade-in card border-accent/40 p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Download size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-content">
            Update available · v{update.version}
          </p>
          <p className="mt-0.5 line-clamp-3 text-xs text-content-muted">
            {update.body?.trim() || "A new version of Terminal is ready to install."}
          </p>

          {installing ? (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-inset">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-200"
                  style={{ width: `${pct ?? 10}%` }}
                />
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-content-faint">
                <RefreshCw size={11} className="animate-spin" />
                {pct !== null ? `Downloading ${pct}%…` : "Installing…"}
              </p>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button className="btn-primary px-3 py-1.5 text-xs" onClick={install}>
                Install & Restart
              </button>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setDismissed(true)}>
                Later
              </button>
            </div>
          )}
        </div>
        {!installing && (
          <button className="btn-ghost -mr-1 -mt-1 p-1" onClick={() => setDismissed(true)} aria-label="Dismiss">
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
