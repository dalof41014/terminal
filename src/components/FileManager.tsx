import { useCallback, useEffect, useRef, useState } from "react";
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
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { localList, sftpList, sftpTransfer } from "../lib/api";
import { useStore } from "../store/useStore";
import type { Host, SftpEntry } from "../lib/types";

const DND_TYPE = "application/x-termfile";

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
function baseName(path: string) {
  return path.split(/[\\/]/).pop() || path;
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

type Side = "left" | "right";

interface PaneState {
  endpoint: string;
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

function Pane({
  side,
  pane,
  hosts,
  dropActive,
  onInternalDrop,
}: {
  side: Side;
  pane: PaneState;
  hosts: Host[];
  dropActive: boolean;
  onInternalDrop: (target: Side, from: Side, name: string) => void;
}) {
  return (
    <div
      data-side={side}
      className={`flex min-h-0 min-w-0 flex-1 flex-col transition-colors ${
        dropActive ? "bg-accent-soft" : ""
      }`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_TYPE)) e.preventDefault();
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(DND_TYPE);
        if (!raw) return;
        e.preventDefault();
        try {
          const d = JSON.parse(raw) as { side: Side; name: string; isDir: boolean };
          if (d.side !== side && !d.isDir) onInternalDrop(side, d.side, d.name);
        } catch {
          /* ignore */
        }
      }}
    >
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
        <button className="btn-ghost ml-auto p-1.5" title="Refresh" onClick={() => pane.load(pane.cwd)}>
          <RefreshCw size={14} className={pane.loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5">
        <button className="btn-ghost p-1" title="Up" onClick={() => pane.load(parentPath(pane.cwd))}>
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
              draggable={!e.isDir}
              onDragStart={(ev) => {
                ev.dataTransfer.setData(
                  DND_TYPE,
                  JSON.stringify({ side, name: e.name, isDir: e.isDir }),
                );
                ev.dataTransfer.effectAllowed = "copy";
              }}
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
  const [dropTarget, setDropTarget] = useState<Side | null>(null);

  // keep latest pane state available to the OS drag-drop listener
  const leftRef = useRef(left);
  const rightRef = useRef(right);
  leftRef.current = left;
  rightRef.current = right;

  const runTransfer = useCallback(async (from: PaneState, to: PaneState, name: string | null) => {
    if (!name) return;
    setBusy(true);
    setMsg(null);
    try {
      const bytes = await sftpTransfer(
        from.hostId,
        joinPath(from.cwd, name),
        to.hostId,
        joinPath(to.cwd, name),
      );
      setMsg(`Copied ${name} (${humanSize(bytes)})`);
      await to.load(to.cwd);
    } catch (e) {
      setMsg("Transfer failed: " + String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const onInternalDrop = (target: Side, from: Side, name: string) => {
    const fromPane = from === "left" ? left : right;
    const toPane = target === "left" ? left : right;
    runTransfer(fromPane, toPane, name);
  };

  // OS files dragged into the window → upload to whichever pane is under the cursor
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const sideAt = (pos: { x: number; y: number }): Side | null => {
      const dpr = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(pos.x / dpr, pos.y / dpr) as HTMLElement | null;
      const side = el?.closest("[data-side]")?.getAttribute("data-side");
      return side === "left" || side === "right" ? side : null;
    };
    (async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        const p = event.payload as any;
        if (p.type === "over") {
          setDropTarget(sideAt(p.position));
        } else if (p.type === "leave") {
          setDropTarget(null);
        } else if (p.type === "drop") {
          const side = sideAt(p.position);
          setDropTarget(null);
          if (!side) return;
          const pane = side === "left" ? leftRef.current : rightRef.current;
          (async () => {
            for (const path of p.paths as string[]) {
              setBusy(true);
              setMsg(null);
              try {
                const bytes = await sftpTransfer(
                  null,
                  path,
                  pane.hostId,
                  joinPath(pane.cwd, baseName(path)),
                );
                setMsg(`Uploaded ${baseName(path)} (${humanSize(bytes)})`);
              } catch (e) {
                setMsg("Upload failed: " + String(e));
              } finally {
                setBusy(false);
              }
            }
            await pane.load(pane.cwd);
          })();
        }
      });
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  const canL2R = !!left.selected && !left.selectedIsDir && !busy;
  const canR2L = !!right.selected && !right.selectedIsDir && !busy;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-inset">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-bg-raised px-4">
        <ArrowLeftRight size={16} className="text-accent" />
        <span className="text-sm font-semibold">File Transfer</span>
        {busy && <RefreshCw size={13} className="animate-spin text-content-faint" />}
        {msg && <span className="ml-2 truncate text-xs text-content-muted">{msg}</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        <Pane
          side="left"
          pane={left}
          hosts={hosts}
          dropActive={dropTarget === "left"}
          onInternalDrop={onInternalDrop}
        />

        <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-3 border-x border-line bg-bg-raised">
          <button
            className="btn-primary h-9 w-9 p-0 disabled:opacity-30"
            title="Copy selected → right"
            disabled={!canL2R}
            onClick={() => runTransfer(left, right, left.selected)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="btn-primary h-9 w-9 p-0 disabled:opacity-30"
            title="Copy selected ← left"
            disabled={!canR2L}
            onClick={() => runTransfer(right, left, right.selected)}
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        <Pane
          side="right"
          pane={right}
          hosts={hosts}
          dropActive={dropTarget === "right"}
          onInternalDrop={onInternalDrop}
        />
      </div>

      <div className="flex h-7 shrink-0 items-center border-t border-line bg-bg-raised px-4 text-[11px] text-content-faint">
        Drag files from your computer onto a pane to upload, or drag between panes to copy. Single files only.
      </div>
    </div>
  );
}
