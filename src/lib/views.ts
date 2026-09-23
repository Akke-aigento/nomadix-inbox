// Eén lijst met views, gebruikt door de sidebar, de command palette en de
// mobiele onderbalk. Stond eerder dubbel (sidebar miste 'muted' in de palette).
import {
  Archive,
  BellOff,
  Clock,
  FileEdit,
  Inbox,
  Mailbox,
  MessageSquareWarning,
  Send,
  type LucideIcon,
} from "lucide-react";
import type { ViewKind } from "@/hooks/useInboxFilters";
import type { MessageKey } from "@/i18n/nl";

export interface ViewDef {
  key: ViewKind;
  labelKey: MessageKey;
  icon: LucideIcon;
  shortcut?: string;
  /** Zichtbaar in de mobiele onderbalk (de rest zit onder "Meer"). */
  primary?: boolean;
}

export const VIEWS: ViewDef[] = [
  { key: "inbox", labelKey: "views.inbox", icon: Inbox, shortcut: "g i", primary: true },
  { key: "needs-reply", labelKey: "views.needs-reply", icon: MessageSquareWarning, shortcut: "g r", primary: true },
  { key: "snoozed", labelKey: "views.snoozed", icon: Clock, shortcut: "g z" },
  { key: "muted", labelKey: "views.muted", icon: BellOff, shortcut: "g m" },
  { key: "sent", labelKey: "views.sent", icon: Send, primary: true },
  { key: "drafts", labelKey: "views.drafts", icon: FileEdit },
  { key: "archive", labelKey: "views.archive", icon: Archive, shortcut: "g a" },
  { key: "all", labelKey: "views.all", icon: Mailbox },
];

export function viewDef(key: ViewKind): ViewDef | undefined {
  return VIEWS.find((v) => v.key === key);
}
