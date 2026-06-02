import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  File as FileIcon,
  Folder,
  HardDrive,
  RefreshCw,
  Server,
} from "lucide-react";
import { localList, sftpList, sftpTransfer } from "../lib/api";
import { useStore } from "../store/useStore";
import type { Host, SftpEntry } from "../lib/types";

function sepOf(path: string) {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}
function joinPath(cwd: string, name: string) {
  if (!cwd) return name;
  const s = sepOf(cwd);
  return cwd.endsWith(s) ? cwd + name : cwd + s + name;
}
function parentPath(cwd: string) {
  const trimmed = cwd.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (idx <= 0) return cwd.includes("\\") ? trimmed.slice(0, idx + 1) || trimmed : "/";
  return trimmed.slice(0, idx);
}
function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${u[i]}`;
}

interface PaneState {
  endpoint: string; // "local" | hostId
  hostId: string | null;
  cwd: string;
  entries: SftpEntry[];
  loading: boolean;
  error: string | null;
  selected: string | null;
  selectedIsDir: boolean;
  setEndpoint: (v: string) => void;
  setSelected: (name: string | null, isDir: boolean) => void;
  load: (path: string) => Promise<void>;
}

function usePane(): PaneState {
  const [endpoint, setEndpoint] = useState("local");
  const [cwd, setCwd] = useState("");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSel] = useState<string | null>(null);
  const [selectedIsDir, setSelDir] = useState(false);

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      setSel(null);
      try {
        const res = endpoint === "local" ? await localList(path) : await sftpList(endpoint, path);
        setCwd(res.cwd);
        setEntries(res.entries);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  return {
    endpoint,
    hostId: endpoint === "local" ? null : endpoint,
    cwd,
    entries,
    loading,
    error,
    selected,
    selectedIsDir,
    setEndpoint,
    setSelected: (name, isDir) => {
      setSel(name);
      setSelDir(isDir);
    },
    load,
  };
}

function Pane({ pane, hosts }: { pane: PaneState; hosts: Host[] }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* endpoint selector */}
      <div className="flex h-12 items-center gap-2 border-b border-line px-3">
        {pane.endpoint === "local" ? (
          <HardDrive size={16} className="shrink-0 text-content-muted" />
        ) : (
          <Server size={16} className="shrink-0 text-accent" />
        )}
        <select
          className="input h-8 py-1 text-xs"
          value={pane.endpoint}
          onChange={(e) => pane.setEndpoint(e.target.value)}
        >
          <option value="local">This PC (local)</option>
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label} — {h.username}@{h.address}
            </option>
          ))}
        </select>
        <button
          className="btn-ghost ml-auto p-1.5"
          title="Refresh"
          onClick={() => pane.load(pane.cwd)}
        >
          <RefreshCw size={14} className={pane.loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* path bar */}
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5">
        <button
          className="btn-ghost p-1"
          title="Up"
          onClick={() => pane.load(parentPath(pane.cwd))}
        >
          <ArrowUp size={14} />
        </button>
        <code className="truncate font-mono text-[11px] text-content-muted" dir="rtl">
          {pane.cwd || "…"}
        </code>
      </div>

      {pane.error && (
        <div className="m-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {pane.error}
        </div>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {pane.entries.map((e) => {
          const active = pane.selected === e.name;
          return (
            <li
              key={e.name}
              onClick={() => pane.setSelected(e.name, e.isDir)}
              onDoubleClick={() => e.isDir && pane.load(joinPath(pane.cwd, e.name))}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-150 ${
                active ? "bg-accent-soft text-content" : "hover:bg-surface-hover"
              }`}
            >
              {e.isDir ? (
                <Folder size={16} className="shrink-0 text-info" />
              ) : (
                <FileIcon size={16} className="shrink-0 text-content-faint" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
              {!e.isDir && (
                <span className="shrink-0 font-mono text-[10px] text-content-faint">
                  {humanSize(e.size)}
                </span>
              )}
            </li>
          );
        })}
        {!pane.loading && pane.entries.length === 0 && !pane.error && (
          <li className="px-3 py-6 text-center text-xs text-content-faint">Empty</li>
        )}
      </ul>
    </div>
  );
}

export function FileManager() {
  const hosts = useStore((s) => s.vault.hosts);
  const left = usePane();
  const right = usePane();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const transfer = async (from: PaneState, to: PaneState) => {
    if (!from.selected || from.selectedIsDir) return;
    setBusy(true);
    setMsg(null);
    try {
      const bytes = await sftpTransfer(
        from.hostId,
        joinPath(from.cwd, from.selected),
        to.hostId,
        joinPath(to.cwd, from.selected),
      );
      setMsg(`Transferred ${from.selected} (${humanSize(bytes)})`);
      await to.load(to.cwd);
    } catch (e) {
      setMsg("Transfer failed: " + String(e));
    } finally {
      setBusy(false);
    }
  };

  const canL2R = !!left.selected && !left.selectedIsDir && !busy;
  const canR2L = !!right.selected && !right.selectedIsDir && !busy;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-inset">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-bg-raised px-4">
        <ArrowLeftRight size={16} className="text-accent" />
        <span className="text-sm font-semibold">File Transfer</span>
        {msg && <span className="ml-3 truncate text-xs text-content-muted">{msg}</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        <Pane pane={left} hosts={hosts} />

        {/* transfer controls */}
        <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-3 border-x border-line bg-bg-raised">
          <button
            className="btn-primary h-9 w-9 p-0 disabled:opacity-30"
            title="Copy selected → right"
            disabled={!canL2R}
            onClick={() => transfer(left, right)}
          >
            {busy ? <RefreshCw size={16} className="animate-spin" /> : <ChevronRight size={18} />}
          </button>
          <button
            className="btn-primary h-9 w-9 p-0 disabled:opacity-30"
            title="Copy selected ← left"
            disabled={!canR2L}
            onClick={() => transfer(right, left)}
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        <Pane pane={right} hosts={hosts} />
      </div>

      <div className="flex h-7 shrink-0 items-center border-t border-line bg-bg-raised px-4 text-[11px] text-content-faint">
        Select a file and use the arrows to copy between local and hosts. Directories aren't copied recursively yet.
      </div>
    </div>
  );
}
