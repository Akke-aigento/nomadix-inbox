import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SECTIONS = [
  {
    title: "Navigation",
    items: [
      ["j / k", "Next / previous thread"],
      ["o or Enter", "Open focused thread"],
      ["[", "Toggle sidebar"],
      ["shift + d", "Cycle density"],
      ["/ or ⌘K", "Focus search"],
      ["?", "Show this cheat sheet"],
    ],
  },
  {
    title: "Thread actions",
    items: [
      ["e", "Archive"],
      ["y", "Archive + go to next"],
      ["u", "Toggle read / unread"],
      ["# or ⌘⌫", "Delete"],
      ["x", "Toggle select on focused"],
      ["r / R / f", "Reply / Reply all / Forward (3C)"],
      ["s", "Snooze"],
    ],
  },
];

export function ShortcutCheatSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.items.map(([keys, desc]) => (
                  <li key={keys} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground/80">{desc}</span>
                    <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                      {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
