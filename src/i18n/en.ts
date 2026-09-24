import { authEn } from "./messages/auth";
import { coreEn } from "./messages/core";
import { inboxEn } from "./messages/inbox";
import { rulesEn } from "./messages/rules";
import { settingsEn } from "./messages/settings";
import type { Dict } from "./nl";

// `satisfies Dict` maakt een ontbrekende of onbekende sleutel een buildfout.
export const en = {
  ...coreEn,
  ...inboxEn,
  ...settingsEn,
  ...rulesEn,
  ...authEn,
} satisfies Dict;
