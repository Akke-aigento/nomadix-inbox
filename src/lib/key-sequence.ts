// Shared state for two-key sequences ("g i", "g r", …).
//
// Several listeners react to single keys: react-hotkeys-hook (on document),
// the global sequence resolver and ThreadDetail (both on window). Without a
// shared flag, the second key of "g r" also fires "r" (reply) in an open
// thread, and "g u" also toggles read. Every single-key handler therefore
// bails out while a sequence is pending; the resolver clears it last.

const SEQUENCE_TIMEOUT_MS = 1500;

let pendingTimer: ReturnType<typeof setTimeout> | null = null;

export function startSequence(): void {
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
  }, SEQUENCE_TIMEOUT_MS);
}

export function clearSequence(): void {
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = null;
}

export function isSequencePending(): boolean {
  return pendingTimer !== null;
}
