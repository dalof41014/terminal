import { useState } from "react";
import { Cable, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useStore } from "../../store/useStore";
import type { PortForward } from "../../lib/types";
import { ForwardModal } from "../modals/ForwardModal";
import { forwardStart, forwardStop } from "../../lib/api";

export function ForwardList() {
  const forwards = useStore((s) => s.vault.portForwards);
  const hosts = useStore((s) => s.vault.hosts);
  const search = useStore((s) => s.search).toLowerCase();
  const deleteForward = useStore((s) => s.deleteForward);
  const active = useStore((s) => s.activeForwards);
  const setForwardActive = useStore((s) => s.setForwardActive);
  const [editing, setEditing] = useState<PortForward | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = forwards.filter((f) => f.label.toLowerCase().includes(search));

  const toggle = async (f: PortForward) => {
    try {
      if (active.has(f.id)) {
        await forwardStop(f.id);
        setForwardActive(f.id, false);
      } else {
        await forwardStart(
          f.id,
          f.hostId,
          f.kind,
          f.bindAddress,
          f.bindPort,
          f.destHost ?? "localhost",
          f.destPort ?? f.bindPort,
        );
        setForwardActive(f.id, true);
      }
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div>
      <button className="btn-surface mb-2 w-full justify-center py-1.5 text-xs" onClick={() => setCreating(true)}>
        <Plus size={14} /> New Rule
      </button>

      {filtered.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 px-4 text-center text-content-faint">
          <Cable size={28} className="opacity-40" />
          <p className="text-xs">{forwards.length === 0 ? "No port-forward rules." : "No matches."}</p>
        </div>
      )}

      <ul className="space-y-0.5">
        {filtered.map((f) => {
          const host = hosts.find((h) => h.id === f.hostId);
          const on = active.has(f.id);
          return (
            <li
              key={f.id}
              className="group rounded-lg px-2.5 py-2 transition-colors duration-200 hover:bg-surface-hover"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggle(f)}
                  title={on ? "Stop" : "Start"}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${
                    on ? "bg-accent text-bg" : "bg-surface text-content-faint hover:text-content"
                  }`}
                >
                  <Power size={13} />
                </button>
                <span className="truncate text-sm font-medium text-content">{f.label}</span>
                <span className="chip ml-1">{f.kind}</span>
                <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button className="btn-ghost p-1" title="Edit" onClick={() => setEditing(f)}>
                    <Pencil size={13} />
                  </button>
                  <button
                    className="btn-ghost p-1 hover:text-danger"
                    title="Delete"
                    onClick={() => deleteForward(f.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-content-faint">
                {f.bindAddress}:{f.bindPort} → {f.destHost ?? "localhost"}:{f.destPort ?? f.bindPort}
                {host ? `  ·  via ${host.label}` : ""}
              </div>
            </li>
          );
        })}
      </ul>

      {creating && <ForwardModal onClose={() => setCreating(false)} />}
      {editing && <ForwardModal forward={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
