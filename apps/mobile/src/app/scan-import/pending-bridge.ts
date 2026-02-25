/** Shared ref for passing bridge session ID from deep link to scan-import screen */
let pendingBridgeSession: string | null = null;

export function setPendingBridgeSession(id: string) {
  pendingBridgeSession = id;
}

export function consumePendingBridgeSession(): string | null {
  const id = pendingBridgeSession;
  pendingBridgeSession = null;
  return id;
}
