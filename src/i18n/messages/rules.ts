// Teksten voor het gebied "rules". NL is de brontekst.
// Jargon is bewust herschreven: "routing rule" → regel, "priority" → volgorde,
// "dry-run" → testen zonder iets te wijzigen, "header" → e-mailkenmerk.
export const rulesNl = {
  "rules.title": "Regels",
  "rules.subtitle":
    "Label, archiveer of markeer binnenkomende mail automatisch, nog voor je hem ziet. De regel met het laagste volgnummer is als eerste aan de beurt.",
  "rules.add": "Regel toevoegen",

  "rules.col.name": "Naam",
  "rules.col.priority": "Volgorde",
  "rules.col.actions": "Wat er gebeurt",
  "rules.col.stats": "Gebruik",
  "rules.col.edit": "Bewerken",

  "rules.empty": "Je hebt nog geen regels.",
  "rules.drag": "Sleep om de volgorde te veranderen",

  "rules.match.from": "afzender bevat {value}",
  "rules.match.subject": "onderwerp bevat {value}",
  "rules.match.to": "verstuurd naar bevat {value}",
  "rules.match.header": "heeft e-mailkenmerk {value}",
  "rules.match.none": "geen voorwaarden",

  "rules.badge.category": "+ categorie",
  "rules.badge.label": "+ label",
  "rules.badge.urgency": "urgentie: {value}",
  "rules.badge.markRead": "als gelezen markeren",
  "rules.badge.archive": "archiveren",
  "rules.badge.none": "doet niets",

  "rules.stats.matched": "{count}× toegepast",
  "rules.stats.last": "laatst op {date}",

  "rules.action.test": "Testen zonder iets te wijzigen",

  "rules.delete.title": "Deze regel verwijderen?",
  "rules.delete.body": "“{name}” verdwijnt definitief.",
  "rules.toast.removed": "Regel verwijderd",

  "rules.form.title.new": "Nieuwe regel",
  "rules.form.title.edit": "Regel bewerken",
  "rules.form.description":
    "De regel doet pas iets als álle voorwaarden kloppen. Het laagste volgnummer is als eerste aan de beurt.",
  "rules.form.name": "Naam van de regel",
  "rules.form.name.placeholder": "Meldingen van Stripe",
  "rules.form.priority": "Volgnummer",
  "rules.form.active": "Actief",

  "rules.form.conditions": "Voorwaarden (alle moeten kloppen)",
  "rules.form.from": "Afzender bevat",
  "rules.form.subject": "Onderwerp bevat",
  "rules.form.to": "Verstuurd naar bevat",
  "rules.form.header": "Heeft e-mailkenmerk (header)",
  "rules.form.brand": "Merk",
  "rules.form.brand.any": "Elk merk",

  "rules.form.actions": "Wat er dan gebeurt",
  "rules.form.addCategory": "Categorie toevoegen",
  "rules.form.addLabel": "Label toevoegen",
  "rules.form.none": "Geen",
  "rules.form.urgency": "Urgentie zetten op",
  "rules.form.urgency.keep": "Niet veranderen",
  "rules.form.urgency.low": "Laag",
  "rules.form.urgency.normal": "Normaal",
  "rules.form.urgency.high": "Hoog",
  "rules.form.urgency.urgent": "Dringend",
  "rules.form.extras": "En verder",
  "rules.form.markRead": "Meteen als gelezen markeren",
  "rules.form.archive": "Meteen archiveren",

  "rules.form.saving": "Opslaan…",
  "rules.form.save": "Wijzigingen opslaan",
  "rules.form.error.name": "Geef de regel eerst een naam",
  "rules.toast.added": "Regel toegevoegd",
  "rules.toast.updated": "Regel bijgewerkt",
  "rules.toast.saveFailed": "Opslaan mislukt",

  "rules.test.title": "Regel testen: {name}",
  "rules.test.description":
    "We laten zien wat deze regel met je laatste 50 binnengekomen berichten zou doen. Er verandert niets.",
  "rules.test.scanning": "Bezig met nakijken…",
  "rules.test.scanned": "{count} bericht bekeken|{count} berichten bekeken",
  "rules.test.matches": "{count} treffer|{count} treffers",
  "rules.test.empty": "Geen treffers bij de laatste 50 berichten.",
  "rules.test.noSubject": "(geen onderwerp)",
} as const;

export const rulesEn = {
  "rules.title": "Rules",
  "rules.subtitle":
    "Label, archive or flag incoming mail automatically, before you even see it. The rule with the lowest number goes first.",
  "rules.add": "Add rule",

  "rules.col.name": "Name",
  "rules.col.priority": "Order",
  "rules.col.actions": "What happens",
  "rules.col.stats": "Use",
  "rules.col.edit": "Edit",

  "rules.empty": "You don't have any rules yet.",
  "rules.drag": "Drag to change the order",

  "rules.match.from": "sender contains {value}",
  "rules.match.subject": "subject contains {value}",
  "rules.match.to": "sent to contains {value}",
  "rules.match.header": "has email header {value}",
  "rules.match.none": "no conditions",

  "rules.badge.category": "+ category",
  "rules.badge.label": "+ label",
  "rules.badge.urgency": "urgency: {value}",
  "rules.badge.markRead": "mark as read",
  "rules.badge.archive": "archive",
  "rules.badge.none": "does nothing",

  "rules.stats.matched": "applied {count}×",
  "rules.stats.last": "last on {date}",

  "rules.action.test": "Test without changing anything",

  "rules.delete.title": "Delete this rule?",
  "rules.delete.body": "“{name}” will be gone for good.",
  "rules.toast.removed": "Rule deleted",

  "rules.form.title.new": "New rule",
  "rules.form.title.edit": "Edit rule",
  "rules.form.description":
    "The rule only acts when all conditions are true. The lowest number goes first.",
  "rules.form.name": "Rule name",
  "rules.form.name.placeholder": "Stripe notifications",
  "rules.form.priority": "Order number",
  "rules.form.active": "Active",

  "rules.form.conditions": "Conditions (all must be true)",
  "rules.form.from": "Sender contains",
  "rules.form.subject": "Subject contains",
  "rules.form.to": "Sent to contains",
  "rules.form.header": "Has email header",
  "rules.form.brand": "Brand",
  "rules.form.brand.any": "Any brand",

  "rules.form.actions": "What happens then",
  "rules.form.addCategory": "Add category",
  "rules.form.addLabel": "Add label",
  "rules.form.none": "None",
  "rules.form.urgency": "Set urgency to",
  "rules.form.urgency.keep": "Leave unchanged",
  "rules.form.urgency.low": "Low",
  "rules.form.urgency.normal": "Normal",
  "rules.form.urgency.high": "High",
  "rules.form.urgency.urgent": "Urgent",
  "rules.form.extras": "And also",
  "rules.form.markRead": "Mark as read straight away",
  "rules.form.archive": "Archive straight away",

  "rules.form.saving": "Saving…",
  "rules.form.save": "Save changes",
  "rules.form.error.name": "Give the rule a name first",
  "rules.toast.added": "Rule added",
  "rules.toast.updated": "Rule updated",
  "rules.toast.saveFailed": "Saving failed",

  "rules.test.title": "Test rule: {name}",
  "rules.test.description":
    "We show what this rule would do to your last 50 incoming messages. Nothing changes.",
  "rules.test.scanning": "Checking…",
  "rules.test.scanned": "{count} message checked|{count} messages checked",
  "rules.test.matches": "{count} match|{count} matches",
  "rules.test.empty": "No matches among the last 50 messages.",
  "rules.test.noSubject": "(no subject)",
} satisfies Record<keyof typeof rulesNl, string>;
