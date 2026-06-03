import {
  ArrowLeftRight,
  Cable,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Server,
  ShieldCheck,
  SquareCode,
} from "lucide-react";
import { useStore, type SidebarView } from "../store/useStore";
import { HostList } from "./lists/HostList";
import { KeyList } from "./lists/KeyList";
import { SnippetList } from "./lists/SnippetList";
import { ForwardList } from "./lists/ForwardList";
import { KnownHostList } from "./lists/KnownHostList";

const NAV: { view: SidebarView; icon: typeof Server; label: string }[] = [
  { view: "hosts", icon: Server, label: "Hosts" },
  { view: "keys", icon: KeyRound, label: "Keychain" },
  { view: "snippets", icon: SquareCode, label: "Snippets" },
  { view: "forwards", icon: Cable, label: "Port Forwarding" },
  { view: "known", icon: ShieldCheck, label: "Known Hosts" },
];

const TITLES: Record<SidebarView, string> = {
  hosts: "Hosts",
  keys: "Keychain",
  snippets: "Snippets",
  forwards: "Port Forwarding",
  known: "Known Hosts",
};

export function Sidebar() {
  const sidebarView = useStore((s) => s.sidebarView);
  const setSidebarView = useStore((s) => s.setSidebarView);
  const mainView = useStore((s) => s.mainView);
  const setMainView = useStore((s) => s.setMainView);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: PointerEvent) => setSidebarWidth(startWidth + (ev.clientX - startX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="flex h-full shrink-0 border-r border-line">
      {/* icon rail */}
      <nav className="flex w-14 flex-col items-center gap-1 border-r border-line bg-bg-raised py-3">
        <button
          title={collapsed ? "Show panel" : "Hide panel"}
          aria-label={collapsed ? "Show panel" : "Hide panel"}
          onClick={toggleSidebar}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-content-faint transition-colors duration-200 cursor-pointer hover:bg-surface-hover hover:text-content"
        >
          {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </button>
        <div className="my-1 h-px w-6 bg-line-strong" />
        {NAV.map(({ view, icon: Icon, label }) => {
          const active = sidebarView === view && mainView === "terminals";
          return (
            <button
              key={view}
              title={label}
              aria-label={label}
              onClick={() => {
                setSidebarView(view);
                setMainView("terminals");
              }}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-200 cursor-pointer ${
                active
                  ? "bg-accent-soft text-accent"
                  : "text-content-faint hover:bg-surface-hover hover:text-content"
              }`}
            >
              {active && (
                <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-accent" />
              )}
              <Icon size={19} />
            </button>
          );
        })}

        <div className="my-1 h-px w-6 bg-line-strong" />

        <button
          title="File Transfer"
          aria-label="File Transfer"
          onClick={() => setMainView("files")}
          className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-200 cursor-pointer ${
            mainView === "files"
              ? "bg-accent-soft text-accent"
              : "text-content-faint hover:bg-surface-hover hover:text-content"
          }`}
        >
          {mainView === "files" && (
            <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-accent" />
          )}
          <ArrowLeftRight size={19} />
        </button>
      </nav>

      {/* list panel */}
      {!collapsed && (
      <div className="relative flex flex-col bg-bg" style={{ width: sidebarWidth }}>
        <div
          onPointerDown={startResize}
          title="Drag to resize"
          className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-accent/50"
        />
        <div className="flex h-12 items-center px-4">
          <h2 className="text-sm font-semibold tracking-tight">{TITLES[sidebarView]}</h2>
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-content-faint"
            />
            <input
              className="input py-1.5 pl-8 text-xs"
              placeholder={`Search ${TITLES[sidebarView].toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {sidebarView === "hosts" && <HostList />}
          {sidebarView === "keys" && <KeyList />}
          {sidebarView === "snippets" && <SnippetList />}
          {sidebarView === "forwards" && <ForwardList />}
          {sidebarView === "known" && <KnownHostList />}
        </div>
      </div>
      )}
    </div>
  );
}
