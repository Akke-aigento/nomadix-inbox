// Brontekst. Nederlands is de standaardtaal: elke sleutel valt hierop terug
// als een vertaling ontbreekt. Sleutels: <scherm>.<onderdeel>.<element>.
// De teksten staan per gebied in ./messages; hier worden ze samengevoegd.
import { authNl } from "./messages/auth";
import { coreNl } from "./messages/core";
import { inboxNl } from "./messages/inbox";
import { rulesNl } from "./messages/rules";
import { settingsNl } from "./messages/settings";

export const nl = {
  ...coreNl,
  ...inboxNl,
  ...settingsNl,
  ...rulesNl,
  ...authNl,
};

export type MessageKey = keyof typeof nl;
export type Dict = Record<MessageKey, string>;
