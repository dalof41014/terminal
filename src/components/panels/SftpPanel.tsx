import { useCallback, useEffect, useState } from "react";
import {
  ArrowUp,
  Download,
  File as FileIcon,
  Folder,
  RefreshCw,
  Upload,
} from "lucide-react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { sftpDownload, sftpList, sftpUpload } from "../../lib/api";
import { useStore } from "../../store/useStore";
import type { SftpEntry } from "../../lib/types";

function joinPath(cwd: string, name: string) {
  if (cwd.endsWith("/")) return cwd + name;
  return cwd + "/" + name;
}
function parentPath(cwd: string) {
  if (cwd === "/" || !cwd.includes("/")) return "/";
  const trimmed = cwd.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}
function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function SftpPanel({ hostId }: { hostId: string }) {
  const setSftpCwd = useStore((s) => s.setSftpCwd);
  const [cwd, setCwd] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await sftpList(hostId, path);
        setCwd(res.cwd);
        setPathInput(res.cwd);
        setEntries(res.entries);
        setSftpCwd(hostId, res.cwd);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [hostId, setSftpCwd],
  );

  useEffect(() => {
    // restore the last folder browsed on this host
    load(useStore.getState().sftpCwd[hostId] || "");
  }, [load, hostId]);

  const download = async (e: SftpEntry) => {
    const remote = joinPath(cwd, e.name);
    const local = await saveDialog({ defaultPath: e.name });
    if (!local) return;
    setBusy(e.name);
    try {
      await sftpDownload(hostId, remote, local);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  const upload = async () => {
    const picked = await openDialog({ multiple: false });
    if (!picked || typeof picked !== "string") return;
    const name = picked.split(/[\\/]/).pop()!;
    setBusy(name);
    try {
      await sftpUpload(hostId, picked, joinPath(cwd, name));
      await load(cwd);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-1 border-b border-line px-3">
        <span className="text-sm font-semibold">Files</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button className="btn-ghost p-1.5" title="Upload" onClick={upload}>
            <Upload size={15} />
          </button>
          <button className="btn-ghost p-1.5" title="Refresh" onClick={() => load(cwd)}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <form
        className="flex items-center gap-1.5 border-b border-line px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          const p = pathInput.trim();
          if (p) load(p);
        }}
      >
        <button
          type="button"
          className="btn-ghost p-1"
          title="Up"
          onClick={() => load(parentPath(cwd))}
          disabled={cwd === "/" || cwd === ""}
        >
          <ArrowUp size={14} />
        </button>
        <input
          className="min-w-0 flex-1 rounded bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-content-muted outline-none placeholder:text-content-faint focus:bg-bg-inset focus:text-content focus:ring-1 focus:ring-accent"
          value={pathInput}
          spellCheck={false}
          placeholder="Type or paste a path, then Enter…"
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setPathInput(cwd);
              (e.target as HTMLInputElement).blur();
            }
          }}
          onBlur={() => setPathInput(cwd)}
        />
      </form>

      {error && (
        <div className="m-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {entries.map((e) => (
          <li
            key={e.name}
            className="group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-200 hover:bg-surface-hover"
            onDoubleClick={() => e.isDir && load(joinPath(cwd, e.name))}
          >
            {e.isDir ? (
              <Folder size={16} className="shrink-0 text-info" />
            ) : (
              <FileIcon size={16} className="shrink-0 text-content-faint" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-content">{e.name}</span>
            {!e.isDir && (
              <>
                <span className="shrink-0 font-mono text-[10px] text-content-faint">
                  {humanSize(e.size)}
                </span>
                <button
                  className="btn-ghost shrink-0 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                  title="Download"
                  onClick={() => download(e)}
                  disabled={busy === e.name}
                >
                  <Download size={13} />
                </button>
              </>
            )}
          </li>
        ))}
        {!loading && entries.length === 0 && !error && (
          <li className="px-3 py-6 text-center text-xs text-content-faint">Empty directory</li>
        )}
      </ul>
    </div>
  );
}
