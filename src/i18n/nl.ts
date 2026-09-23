// Brontekst. Nederlands is de standaardtaal: elke sleutel valt hierop terug
// als een vertaling ontbreekt. Sleutels: <scherm>.<onderdeel>.<element>.
export const nl = {
  // ── algemeen ──
  "common.save": "Opslaan",
  "common.cancel": "Annuleren",
  "common.delete": "Verwijderen",
  "common.edit": "Bewerken",
  "common.close": "Sluiten",
  "common.back": "Terug",
  "common.loading": "Laden…",
  "common.search": "Zoeken",
  "common.more": "Meer",
  "common.undo": "Ongedaan maken",
  "common.language": "Taal",
  "common.theme": "Thema",
  "common.density": "Dichtheid",

  // ── views (gedeeld door sidebar, palette en onderbalk) ──
  "views.inbox": "Inbox",
  "views.needs-reply": "Te beantwoorden",
  "views.snoozed": "Gesnoozed",
  "views.muted": "Gedempt",
  "views.sent": "Verzonden",
  "views.drafts": "Concepten",
  "views.archive": "Archief",
  "views.all": "Alle mail",

  // ── instellingen ──
  "settings.title": "Instellingen",
  "settings.subtitle": "Merken, het e-mailaccount, labels en je voorkeuren.",
  "settings.tabs.brands": "Merken",
  "settings.tabs.email": "E-mailaccount",
  "settings.tabs.labels": "Labels",
  "settings.tabs.preferences": "Voorkeuren",

  // ── voorkeuren ──
  "prefs.language.title": "Taal",
  "prefs.language.help": "Geldt voor de interface. De taal van je e-mails verandert hier niet van.",
  "prefs.language.nl": "Nederlands",
  "prefs.language.en": "Engels",
  "prefs.theme.title": "Thema",
  "prefs.theme.help": "Donker is de standaard. Systeem volgt je toestel.",
  "prefs.theme.system": "Systeem",
  "prefs.theme.light": "Licht",
  "prefs.theme.dark": "Donker",
  "prefs.density.title": "Dichtheid van de lijst",
  "prefs.density.help": "Hoeveel gesprekken je tegelijk ziet.",
  "prefs.density.comfortable": "Ruim",
  "prefs.density.compact": "Compact",
  "prefs.density.dense": "Dicht",
  "prefs.storage.note": "Deze voorkeuren staan op dit apparaat, niet in je account.",
} as const;

export type MessageKey = keyof typeof nl;
export type Dict = Record<MessageKey, string>;
