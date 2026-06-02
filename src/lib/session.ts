import { sshSend } from "./api";

/** Send a snippet/command into a live terminal session (by tab id). */
export async function runSnippet(tabId: string, command: string) {
  const text = command.endsWith("\n") ? command : command + "\n";
  await sshSend(tabId, text);
}
