import { useState } from "react";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "../../store/useStore";
import type { SshKey } from "../../lib/types";
import { KeyModal } from "../modals/KeyModal";

export function KeyList() {
  const keys = useStore((s) => s.vault.keys);
  const search = useStore((s) => s.search).toLowerCase();
  const deleteKey = useStore((s) => s.deleteKey);
  const [editing, setEditing] = useState<SshKey | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = keys.filter((k) => k.label.toLowerCase().includes(search));

  return (
    <div>
      <button className="btn-surface mb-2 w-full justify-center py-1.5 text-xs" onClick={() => setCreating(true)}>
        <Plus size={14} /> Add Key
      </button>

      {filtered.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 px-4 text-center text-content-faint">
          <KeyRound size={28} className="opacity-40" />
          <p className="text-xs">{keys.length === 0 ? "No SSH keys stored." : "No matches."}</p>
        </div>
      )}

      <ul className="space-y-0.5">
        {filtered.map((k) => (
          <li
            key={k.id}
            className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-200 hover:bg-surface-hover"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-info/15 text-info">
              <KeyRound size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-content">{k.label}</div>
              <div className="truncate font-mono text-[11px] text-content-faint">
                {k.publicKey ? k.publicKey.slice(0, 28) + "…" : "private key"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button className="btn-ghost p-1" title="Edit" onClick={() => setEditing(k)}>
                <Pencil size={13} />
              </button>
              <button className="btn-ghost p-1 hover:text-danger" title="Delete" onClick={() => deleteKey(k.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {creating && <KeyModal onClose={() => setCreating(false)} />}
      {editing && <KeyModal sshKey={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
