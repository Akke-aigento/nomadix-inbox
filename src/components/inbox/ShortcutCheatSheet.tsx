import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/i18n";
import type { MessageKey } from "@/i18n/nl";

// Toetsen zoals ze echt gebonden zijn (useInboxKeyboard + ThreadDetail).
// Het oude overzicht klopte niet: het noemde "R" voor allen-antwoorden (is ⇧A),
// "s" voor snooze (is b) en een verdwenen "(3C)".
const SECTIONS: { titleKey: MessageKey; items: [string, MessageKey][] }[] = [
  {
    titleKey: "inbox.shortcuts.navigation",
    items: [
      ["j / k", "inbox.shortcuts.nextPrev"],
      ["o / ↩", "inbox.shortcuts.open"],
      ["[", "inbox.shortcuts.toggleSidebar"],
      ["⇧D", "inbox.shortcuts.cycleDensity"],
      ["/", "inbox.shortcuts.focusSearch"],
      ["⌘K", "inbox.shortcuts.palette"],
      ["g + i / r / z / m / a", "inbox.shortcuts.views"],
      ["g + 1-9", "inbox.shortcuts.brands"],
      ["?", "inbox.shortcuts.showSheet"],
    ],
  },
  {
    titleKey: "inbox.shortcuts.threadActions",
    items: [
      ["e", "inbox.shortcuts.archive"],
      ["y", "inbox.shortcuts.archiveNext"],
      ["u", "inbox.shortcuts.toggleRead"],
      ["# / ⌘⌫", "inbox.shortcuts.delete"],
      ["x", "inbox.shortcuts.toggleSelect"],
      ["r / ⇧A / f", "inbox.shortcuts.replyForward"],
      ["b", "inbox.shortcuts.snooze"],
      ["v", "inbox.shortcuts.labels"],
      ["m", "inbox.shortcuts.mute"],
      ["⌘↩", "inbox.shortcuts.send"],
    ],
  },
];

export function ShortcutCheatSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const t = useT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("inbox.shortcuts.title")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <div key={section.titleKey}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(section.titleKey)}
              </h3>
              <ul className="space-y-1.5">
                {section.items.map(([keys, descKey]) => (
                  <li key={keys} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{t(descKey)}</span>
                    <kbd className="flex-none rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-2xs">
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
