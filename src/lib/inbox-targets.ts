// Which threads does an action (archive, delete, read, …) apply to?
//
// Priority: explicit multi-selection > the thread that is open > the row that
// has keyboard focus. The open thread must win over the focused row: after
// opening a thread via deeplink or the command palette, focus still sits on
// row 0, and "e" / "#" would otherwise hit a thread the user isn't looking at.
export function resolveTargetIds(
  selectedIds: Set<string>,
  openThreadId: string | null,
  focusedThreadId: string | null,
): string[] {
  if (selectedIds.size > 0) return Array.from(selectedIds);
  if (openThreadId) return [openThreadId];
  if (focusedThreadId) return [focusedThreadId];
  return [];
}
