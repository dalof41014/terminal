import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { khForget, khList } from "../../lib/api";
import { useStore } from "../../store/useStore";
import type { KnownHost } from "../../lib/types";

export function KnownHostList() {
  const search = useStore((s) => s.search).toLowerCase();
  const [hosts, setHosts] = useState<KnownHost[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHosts(await khList());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const forget = async (host: string) => {
    await khForget(host);
    await load();
  };

  const filtered = hosts.filter(
    (h) => h.host.toLowerCase().includes(search) || h.fingerprint.toLowerCase().includes(search),
  );

  return (
    <div>
      <button className="btn-surface mb-2 w-full justify-center py-1.5 text-xs" onClick={load}>
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
      </button>

      {filtered.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 px-4 text-center text-content-faint">
          <ShieldCheck size={28} className="opacity-40" />
          <p className="text-xs">
            {hosts.length === 0 ? "No host keys trusted yet." : "No matches."}
          </p>
        </div>
      )}

      <ul className="space-y-0.5">
        {filtered.map((h) => (
          <li
            key={h.host}
            className="group rounded-lg px-2.5 py-2 transition-colors duration-200 hover:bg-surface-hover"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="shrink-0 text-accent" />
              <span className="truncate font-mono text-xs text-content">{h.host}</span>
              <span className="chip ml-auto shrink-0">{h.keyType || "key"}</span>
              <button
                className="btn-ghost shrink-0 p-1 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                title="Forget (will re-trust on next connect)"
                onClick={() => forget(h.host)}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <code className="mt-1 block truncate font-mono text-[10px] text-content-faint">
              {h.fingerprint}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}
