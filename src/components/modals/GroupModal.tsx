import { useState } from "react";
import { nanoid } from "nanoid";
import { Modal, Field } from "../ui/Modal";
import { useStore } from "../../store/useStore";
import type { Group } from "../../lib/types";

export function GroupModal({ group, onClose }: { group?: Group; onClose: () => void }) {
  const groups = useStore((s) => s.vault.groups);
  const saveGroup = useStore((s) => s.saveGroup);
  const [name, setName] = useState(group?.name ?? "");
  const [parentId, setParentId] = useState(group?.parentId ?? "");

  // a group cannot be its own parent or nested under its own descendants
  const descendants = (id: string): Set<string> => {
    const out = new Set<string>([id]);
    let added = true;
    while (added) {
      added = false;
      for (const g of groups) {
        if (g.parentId && out.has(g.parentId) && !out.has(g.id)) {
          out.add(g.id);
          added = true;
        }
      }
    }
    return out;
  };
  const blocked = group ? descendants(group.id) : new Set<string>();
  const parentOptions = groups.filter((g) => !blocked.has(g.id));

  const save = async () => {
    const next: Group = {
      id: group?.id ?? nanoid(10),
      name: name || "Untitled group",
      parentId: parentId || null,
    };
    await saveGroup(next);
    onClose();
  };

  return (
    <Modal
      title={group ? "Edit Group" : "New Group"}
      subtitle="Organize hosts into a nested tree."
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={!name}>
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <input
          autoFocus
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Production"
        />
      </Field>
      <Field label="Parent group">
        <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">— None (top level) —</option>
          {parentOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}
