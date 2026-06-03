import { Bot, Terminal } from "lucide-react";
import { useStore, type Tab } from "../../store/useStore";
import { runSnippet } from "../../lib/session";

/**
 * Right-side panel showing curated commands for the AI tool running in `tab`.
 * Clicking a command sends it straight into that terminal session.
 */
export function AiCommandPanel({ tab }: { tab: Tab }) {
  const aiTools = useStore((s) => s.aiTools);
  const tool = aiTools.find((t) => t.id === tab.aiTool);

  const run = (command: string) => {
    runSnippet(tab.id, command, tab.kind).catch(() => {});
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2 border-b border-line px-4">
        <Bot size={16} className="text-accent" />
        <span className="text-sm font-semibold">{tool?.name ?? "AI commands"}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!tool || tool.commands.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-content-faint">
            No curated commands yet. Type directly in the terminal.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {tool.commands.map((c) => (
              <li key={c.command}>
                <button
                  onClick={() => run(c.command)}
                  title={`Send "${c.command}" to the terminal`}
                  className="group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-200 hover:bg-surface-hover"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface text-content-faint transition-colors group-hover:text-accent">
                    <Terminal size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-content">{c.label}</span>
                    <span className="block truncate font-mono text-[11px] text-content-faint">
                      {c.command}
                    </span>
                    {c.hint && (
                      <span className="block truncate text-[11px] text-content-faint/80">{c.hint}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {tool && (
        <div className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-content-faint">
          Common commands for {tool.name} — clicking sends one into this terminal.
          Per-version command sets are coming.
        </div>
      )}
    </div>
  );
}
