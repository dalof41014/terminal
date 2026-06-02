import { useState } from "react";
import { nanoid } from "nanoid";
import { Modal, Field } from "../ui/Modal";
import { useStore } from "../../store/useStore";
import type { Snippet } from "../../lib/types";

export function SnippetModal({ snippet, onClose }: { snippet?: Snippet; onClose: () => void }) {
  const saveSnippet = useStore((s) => s.saveSnippet);
  const [label, setLabel] = useState(snippet?.label ?? "");
  const [command, setCommand] = useState(snippet?.command ?? "");

  const save = async () => {
    const next: Snippet = {
      id: snippet?.id ?? nanoid(10),
      label: label || command.slice(0, 24),
      command,
      group: snippet?.group ?? null,
    };
    await saveSnippet(next);
    onClose();
  };

  return (
    <Modal
      title={snippet ? "Edit Snippet" : "New Snippet"}
      subtitle="Reusable command you can run on any host."
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={!command}>
            Save
          </button>
        </>
      }
    >
      <Field label="Label">
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tail nginx log" />
      </Field>
      <Field label="Command">
        <textarea
          className="input h-28 resize-none font-mono text-xs leading-relaxed"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="tail -f /var/log/nginx/access.log"
          spellCheck={false}
        />
      </Field>
    </Modal>
  );
}
