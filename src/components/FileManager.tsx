import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUp,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  File as FileIcon,
  Folder,
  HardDrive,
  Image as ImageIcon,
  RefreshCw,
  Server,
  X,
} from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { fileReadB64, localList, sftpList, sftpTransfer } from "../lib/api";
import { useStore } from "../store/useStore";
import type { Host, SftpEntry } from "../lib/types";

const DND_TYPE = "application/x-termfile";
const IMG_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"];

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
function isImage(name: string) {
  return IMG_EXT.includes(ext(name));
}
function mimeOf(name: string) {
  const e = ext(name);
  if (e === "svg") return "image/svg+xml";
  if (e === "jpg") return "image/jpeg";
  if (e === "ico") return "image/x-icon";
  return `image/${e}`;
}
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
  selected: Set<string>;
  setEndpoint: (v: string) => void;
  handleClick: (index: number, ctrl: boolean, shift: boolean) => void;
  selectAll: () => void;
  clearSel: () => void;
  selectedFiles: () => string[];
  load: (path: string) => Promise<void>;
}

function usePane(): PaneState {
  const [endpoint, setEndpoint] = useState("local");
  const [cwd, setCwd] = useState("");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastIdx = useRef(-1);

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      setSelected(new Set());
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
    setEndpoint,
    handleClick: (index, ctrl, shift) => {
      const name = entries[index]?.name;
      if (!name) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (shift && lastIdx.current >= 0) {
          const a = Math.min(lastIdx.current, index);
          const b = Math.max(lastIdx.current, index);
          next.clear();
          for (let i = a; i <= b; i++) next.add(entries[i].name);
        } else if (ctrl) {
          next.has(name) ? next.delete(name) : next.add(name);
        } else {
          next.clear();
          next.add(name);
        }
        return next;
      });
      lastIdx.current = index;
    },
    selectAll: () => setSelected(new Set(entries.map((e) => e.name))),
    clearSel: () => setSelected(new Set()),
    selectedFiles: () =>
      entries.filter((e) => selected.has(e.name) && !e.isDir).map((e) => e.name),
    load,
  };
}

function Pane({
  side,
  pane,
  hosts,
  dropActive,
  onInternalDrop,
  onPreview,
}: {
  side: Side;
  pane: PaneState;
  hosts: Host[];
  dropActive: boolean;
  onInternalDrop: (target: Side, from: Side, names: string[]) => void;
  onPreview: (pane: PaneState, name: string) => void;
}) {
  const selCount = pane.selected.size;
  return (
    <div
      data-side={side}
      className={`flex min-h-0 min-w-0 flex-1 flex-col transition-colors ${
        dropActive ? "bg-accent-soft ring-1 ring-inset ring-accent" : ""
      }`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_TYPE)) e.preventDefault();
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(DND_TYPE);
        if (!raw) return;
        e.preventDefault();
        try {
          const d = JSON.parse(raw) as { side: Side; names: string[] };
          if (d.side !== side && d.names.length) onInternalDrop(side, d.side, d.names);
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
        <button className="btn-ghost ml-auto p-1.5" title="Select all" onClick={pane.selectAll}>
          <CheckSquare size={14} />
        </button>
        <button className="btn-ghost p-1.5" title="Refresh" onClick={() => pane.load(pane.cwd)}>
          <RefreshCw size={14} className={pane.loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5">
        <button className="btn-ghost p-1" title="Up" onClick={() => pane.load(parentPath(pane.cwd))}>
          <ArrowUp size={14} />
        </button>
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-content-muted" dir="rtl">
          {pane.cwd || "…"}
        </code>
        {selCount > 0 && <span className="chip shrink-0">{selCount} selected</span>}
      </div>

      {pane.error && (
        <div className="m-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {pane.error}
        </div>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5" onClick={(e) => e.target === e.currentTarget && pane.clearSel()}>
        {pane.entries.map((entry, index) => {
          const active = pane.selected.has(entry.name);
          const img = isImage(entry.name);
          return (
            <li
              key={entry.name}
              draggable={!entry.isDir}
              onDragStart={(ev) => {
                const names = pane.selected.has(entry.name) ? pane.selectedFiles() : [entry.name];
                ev.dataTransfer.setData(DND_TYPE, JSON.stringify({ side, names }));
                ev.dataTransfer.effectAllowed = "copy";
              }}
              onClick={(ev) => pane.handleClick(index, ev.ctrlKey || ev.metaKey, ev.shiftKey)}
              onDoubleClick={() => {
                if (entry.isDir) pane.load(joinPath(pane.cwd, entry.name));
                else if (img) onPreview(pane, entry.name);
              }}
              className={`flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-150 ${
                active ? "bg-accent-soft text-content ring-1 ring-inset ring-accent/40" : "hover:bg-surface-hover"
              }`}
            >
              {entry.isDir ? (
                <Folder size={16} className="shrink-0 text-info" />
              ) : img ? (
                <ImageIcon size={16} className="shrink-0 text-accent" />
              ) : (
                <FileIcon size={16} className="shrink-0 text-content-faint" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
              {!entry.isDir && (
                <span className="shrink-0 font-mono text-[10px] text-content-faint">
                  {humanSize(entry.size)}
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

interface PreviewState {
  name: string;
  url: string | null;
  loading: boolean;
  error: string | null;
}

export function FileManager() {
  const hosts = useStore((s) => s.vault.hosts);
  const left = usePane();
  const right = usePane();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Side | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const leftRef = useRef(left);
  const rightRef = useRef(right);
  leftRef.current = left;
  rightRef.current = right;

  const transferMany = useCallback(
    async (from: PaneState, to: PaneState, names: string[]) => {
      const files = names.filter((n) => {
        const e = from.entries.find((x) => x.name === n);
        return e && !e.isDir;
      });
      if (!files.length) return;
      setBusy(true);
      setMsg(null);
      let done = 0;
      try {
        for (const name of files) {
          setMsg(`Copying ${++done}/${files.length}: ${name}`);
          await sftpTransfer(
            from.hostId,
            joinPath(from.cwd, name),
            to.hostId,
            joinPath(to.cwd, name),
          );
        }
        setMsg(`Copied ${files.length} file${files.length > 1 ? "s" : ""}`);
        await to.load(to.cwd);
      } catch (e) {
        setMsg("Transfer failed: " + String(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const onInternalDrop = (target: Side, from: Side, names: string[]) => {
    const fromPane = from === "left" ? left : right;
    const toPane = target === "left" ? left : right;
    transferMany(fromPane, toPane, names);
  };

  const openPreview = useCallback(async (pane: PaneState, name: string) => {
    setPreview({ name, url: null, loading: true, error: null });
    try {
      const b64 = await fileReadB64(pane.hostId, joinPath(pane.cwd, name));
      setPreview({ name, url: `data:${mimeOf(name)};base64,${b64}`, loading: false, error: null });
    } catch (e) {
      setPreview({ name, url: null, loading: false, error: String(e) });
    }
  }, []);

  // OS file drop → upload to the pane under the cursor
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const sideAt = (pos: { x: number; y: number }): Side | null => {
      const dpr = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(pos.x / dpr, pos.y / dpr) as HTMLElement | null;
      const s = el?.closest("[data-side]")?.getAttribute("data-side");
      return s === "left" || s === "right" ? s : null;
    };
    (async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        const p = event.payload as any;
        if (p.type === "over") setDropTarget(sideAt(p.position));
        else if (p.type === "leave") setDropTarget(null);
        else if (p.type === "drop") {
          const side = sideAt(p.position);
          setDropTarget(null);
          if (!side) return;
          const pane = side === "left" ? leftRef.current : rightRef.current;
          (async () => {
            setBusy(true);
            let done = 0;
            const paths = p.paths as string[];
            try {
              for (const path of paths) {
                setMsg(`Uploading ${++done}/${paths.length}: ${baseName(path)}`);
                await sftpTransfer(null, path, pane.hostId, joinPath(pane.cwd, baseName(path)));
              }
              setMsg(`Uploaded ${paths.length} file${paths.length > 1 ? "s" : ""}`);
            } catch (e) {
              setMsg("Upload failed: " + String(e));
            } finally {
              setBusy(false);
              await pane.load(pane.cwd);
            }
          })();
        }
      });
    })();
    return () => unlisten?.();
  }, []);

  const leftSel = left.selectedFiles();
  const rightSel = right.selectedFiles();

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
          onPreview={openPreview}
        />

        <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-3 border-x border-line bg-bg-raised">
          <button
            className="btn-primary h-9 w-9 p-0 disabled:opacity-30"
            title="Copy selected → right"
            disabled={!leftSel.length || busy}
            onClick={() => transferMany(left, right, leftSel)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="btn-primary h-9 w-9 p-0 disabled:opacity-30"
            title="Copy selected ← left"
            disabled={!rightSel.length || busy}
            onClick={() => transferMany(right, left, rightSel)}
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
          onPreview={openPreview}
        />
      </div>

      <div className="flex h-7 shrink-0 items-center border-t border-line bg-bg-raised px-4 text-[11px] text-content-faint">
        Click to select · Ctrl/Shift-click for multiple · drag between panes or onto a pane to copy ·
        double-click an image to preview.
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8 animate-fade-in"
          onClick={() => setPreview(null)}
        >
          <div className="flex max-h-full max-w-4xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <ImageIcon size={15} className="text-accent" />
              <span className="truncate text-sm text-content">{preview.name}</span>
              <button className="btn-ghost ml-auto p-1.5" onClick={() => setPreview(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="flex min-h-0 items-center justify-center overflow-auto rounded-xl border border-line bg-bg-inset p-3">
              {preview.loading && (
                <div className="flex items-center gap-2 px-10 py-16 text-sm text-content-muted">
                  <RefreshCw size={16} className="animate-spin" /> Loading…
                </div>
              )}
              {preview.error && (
                <div className="px-10 py-16 text-sm text-danger">{preview.error}</div>
              )}
              {preview.url && (
                <img src={preview.url} alt={preview.name} className="max-h-[70vh] max-w-full object-contain" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
