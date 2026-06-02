import { useState } from "react";
import { nanoid } from "nanoid";
import { Modal, Field } from "../ui/Modal";
import { useStore } from "../../store/useStore";
import type { ForwardKind, PortForward } from "../../lib/types";

export function ForwardModal({ forward, onClose }: { forward?: PortForward; onClose: () => void }) {
  const hosts = useStore((s) => s.vault.hosts);
  const saveForward = useStore((s) => s.saveForward);

  const [label, setLabel] = useState(forward?.label ?? "");
  const [hostId, setHostId] = useState(forward?.hostId ?? hosts[0]?.id ?? "");
  const [kind, setKind] = useState<ForwardKind>(forward?.kind ?? "Local");
  const [bindAddress, setBindAddress] = useState(forward?.bindAddress ?? "127.0.0.1");
  const [bindPort, setBindPort] = useState(forward?.bindPort ?? 8080);
  const [destHost, setDestHost] = useState(forward?.destHost ?? "localhost");
  const [destPort, setDestPort] = useState(forward?.destPort ?? 80);

  const save = async () => {
    const next: PortForward = {
      id: forward?.id ?? nanoid(10),
      label: label || `${bindPort}→${destPort}`,
      hostId,
      kind,
      bindAddress,
      bindPort: Number(bindPort),
      destHost: kind === "Dynamic" ? null : destHost,
      destPort: kind === "Dynamic" ? null : Number(destPort),
    };
    await saveForward(next);
    onClose();
  };

  return (
    <Modal
      title={forward ? "Edit Forward" : "New Port Forward"}
      subtitle="Tunnel traffic securely through an SSH host."
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={!hostId}>
            Save
          </button>
        </>
      }
    >
      <Field label="Label">
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="DB tunnel" />
      </Field>

      <Field label="Via host">
        <select className="input" value={hostId} onChange={(e) => setHostId(e.target.value)}>
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label} ({h.address})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Type">
        <div className="flex gap-1.5">
          {(["Local", "Remote", "Dynamic"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                kind === k
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line-strong text-content-muted hover:bg-surface-hover"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Bind address">
            <input
              className="input font-mono"
              value={bindAddress}
              onChange={(e) => setBindAddress(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Bind port">
          <input
            className="input font-mono"
            type="number"
            value={bindPort}
            onChange={(e) => setBindPort(Number(e.target.value))}
          />
        </Field>
      </div>

      {kind !== "Dynamic" && (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Destination host">
              <input
                className="input font-mono"
                value={destHost}
                onChange={(e) => setDestHost(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Dest port">
            <input
              className="input font-mono"
              type="number"
              value={destPort}
              onChange={(e) => setDestPort(Number(e.target.value))}
            />
          </Field>
        </div>
      )}
      {kind === "Dynamic" && (
        <p className="text-xs text-content-faint">
          Dynamic (SOCKS) forwarding routes via the bind port. Destination is chosen per-connection.
        </p>
      )}
    </Modal>
  );
}
