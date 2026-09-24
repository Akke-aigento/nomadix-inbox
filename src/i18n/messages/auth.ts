// Teksten voor het gebied "auth": inloggen, registreren en de 404-pagina.
// NL is de brontekst.
export const authNl = {
  "auth.title": "Alle mail op één plek",
  "auth.signin.lead": "Log in om verder te gaan.",
  "auth.signup.lead": "Maak je account aan.",

  "auth.email": "E-mailadres",
  "auth.password": "Wachtwoord",
  "auth.busy": "Even geduld…",
  "auth.submit.signin": "Inloggen",
  "auth.submit.signup": "Account aanmaken",

  "auth.switch.toSignup": "Eerste keer hier? Maak je account aan",
  "auth.switch.toSignin": "Heb je al een account? Log in",

  "auth.toast.signedIn": "Je bent ingelogd",
  "auth.toast.signedUp": "Account aangemaakt — je bent meteen ingelogd",
  "auth.error.failed": "Aanmelden mislukt",

  "auth.notfound.title": "Pagina niet gevonden",
  "auth.notfound.lead": "Deze pagina bestaat niet (meer).",
  "auth.notfound.home": "Terug naar het begin",
  "auth.signOut": "Uitloggen",
  "auth.appName": "Alles-in-één inbox",
} as const;

export const authEn = {
  "auth.title": "All your mail in one place",
  "auth.signin.lead": "Sign in to continue.",
  "auth.signup.lead": "Create your account.",

  "auth.email": "Email address",
  "auth.password": "Password",
  "auth.busy": "One moment…",
  "auth.submit.signin": "Sign in",
  "auth.submit.signup": "Create account",

  "auth.switch.toSignup": "First time here? Create your account",
  "auth.switch.toSignin": "Already have an account? Sign in",

  "auth.toast.signedIn": "You're signed in",
  "auth.toast.signedUp": "Account created — you're signed in",
  "auth.error.failed": "Sign-in failed",

  "auth.notfound.title": "Page not found",
  "auth.notfound.lead": "This page doesn't exist (any more).",
  "auth.notfound.home": "Back to the start",
  "auth.signOut": "Sign out",
  "auth.appName": "Unified Inbox",
} satisfies Record<keyof typeof authNl, string>;
