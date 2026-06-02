import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { sshClose, sshOpenShell, sshResize, sshSend } from "../lib/api";
import { useStore, type Tab } from "../store/useStore";

const THEME = {
  background: "#0B1220",
  foreground: "#E2E8F0",
  cursor: "#22C55E",
  cursorAccent: "#0B1220",
  selectionBackground: "#22C55E40",
  black: "#1E293B",
  red: "#F43F5E",
  green: "#22C55E",
  yellow: "#FBBF24",
  blue: "#38BDF8",
  magenta: "#A78BFA",
  cyan: "#2DD4BF",
  white: "#E2E8F0",
  brightBlack: "#475569",
  brightRed: "#FB7185",
  brightGreen: "#4ADE80",
  brightYellow: "#FCD34D",
  brightBlue: "#7DD3FC",
  brightMagenta: "#C4B5FD",
  brightCyan: "#5EEAD4",
  brightWhite: "#F8FAFC",
};

const SEARCH_OPTS = {
  decorations: {
    matchBackground: "#FBBF24",
    matchOverviewRuler: "#FBBF24",
    activeMatchBackground: "#22C55E",
    activeMatchColorOverviewRuler: "#22C55E",
  },
};

export function TerminalView({ tab }: { tab: Tab }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const setTabStatus = useStore((s) => s.setTabStatus);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      theme: THEME,
      allowProposedApi: true,
      scrollback: 10000,
    });
    const fit = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(searchAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(el);
    fit.fit();
    termRef.current = term;
    searchRef.current = searchAddon;

    // Keyboard shortcuts: copy/paste and in-terminal search.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Ctrl/Cmd+Shift+C → copy selection
      if (mod && e.shiftKey && key === "c") {
        const sel = term.getSelection();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {});
          return false;
        }
        return true;
      }
      // Ctrl/Cmd+Shift+V → paste into the session
      if (mod && e.shiftKey && key === "v") {
        navigator.clipboard
          .readText()
          .then((t) => {
            if (t) sshSend(tab.id, t).catch(() => {});
          })
          .catch(() => {});
        return false;
      }
      // Ctrl/Cmd+F → search
      if (mod && !e.shiftKey && key === "f") {
        setSearchOpen(true);
        return false;
      }
      return true;
    });

    let unlistenData: UnlistenFn | undefined;
    let unlistenClosed: UnlistenFn | undefined;
    let disposed = false;
    let firstData = true;

    (async () => {
      unlistenData = await listen<string>(`ssh://data/${tab.id}`, (e) => {
        if (firstData) {
          firstData = false;
          setTabStatus(tab.id, "connected");
        }
        term.write(e.payload);
      });
      unlistenClosed = await listen(`ssh://closed/${tab.id}`, () => {
        setTabStatus(tab.id, "closed");
        term.write("\r\n\x1b[2m[ session closed ]\x1b[0m\r\n");
      });

      try {
        await sshOpenShell(tab.id, tab.hostId, term.cols, term.rows);
      } catch (err) {
        if (!disposed) {
          setTabStatus(tab.id, "error", String(err));
          term.write(`\r\n\x1b[31m✖ ${String(err)}\x1b[0m\r\n`);
        }
      }
    })();

    const onData = term.onData((data) => {
      sshSend(tab.id, data).catch(() => {});
    });

    const doFit = () => {
      try {
        fit.fit();
        sshResize(tab.id, term.cols, term.rows).catch(() => {});
      } catch {
        /* noop */
      }
    };
    const ro = new ResizeObserver(doFit);
    ro.observe(el);

    term.focus();

    return () => {
      disposed = true;
      ro.disconnect();
      onData.dispose();
      unlistenData?.();
      unlistenClosed?.();
      sshClose(tab.id).catch(() => {});
      term.dispose();
      termRef.current = null;
      searchRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  const findNext = (q = query) => q && searchRef.current?.findNext(q, SEARCH_OPTS);
  const findPrev = (q = query) => q && searchRef.current?.findPrevious(q, SEARCH_OPTS);

  const closeSearch = () => {
    setSearchOpen(false);
    searchRef.current?.clearDecorations();
    termRef.current?.focus();
  };

  return (
    <div className="relative h-full w-full bg-[#0B1220]">
      {tab.status === "error" && (
        <div className="absolute right-3 top-3 z-10 rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          Connection failed
        </div>
      )}

      {searchOpen && (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-line-strong bg-bg-raised p-1 shadow-xl animate-fade-in">
          <input
            autoFocus
            className="w-44 bg-transparent px-2 py-1 text-xs text-content outline-none placeholder:text-content-faint"
            placeholder="Find in terminal…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              findNext(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.shiftKey ? findPrev() : findNext());
              if (e.key === "Escape") closeSearch();
            }}
          />
          <button className="btn-ghost p-1" title="Previous (Shift+Enter)" onClick={() => findPrev()}>
            <ArrowUp size={14} />
          </button>
          <button className="btn-ghost p-1" title="Next (Enter)" onClick={() => findNext()}>
            <ArrowDown size={14} />
          </button>
          <button className="btn-ghost p-1" title="Close (Esc)" onClick={closeSearch}>
            <X size={14} />
          </button>
        </div>
      )}

      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
