import { localSend, sshSend, telnetSend } from "./api";

/** Send a snippet/command into a live terminal session (by tab id). */
export async function runSnippet(
  tabId: string,
  command: string,
  kind: "ssh" | "local" | "telnet" = "ssh",
) {
  const text = command.endsWith("\n") ? command : command + "\n";
  const send = kind === "telnet" ? telnetSend : kind === "local" ? localSend : sshSend;
  await send(tabId, text);
}
