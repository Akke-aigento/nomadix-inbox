

# Nomadix Unified Inbox — Phase 1: Foundation

Build the database schema, brand management UI, and credential storage. No IMAP sync or inbox UI yet.

## 1. Backend (Lovable Cloud + Vault)

**Database — 9 tables with RLS** (`auth.uid() IS NOT NULL` for all CRUD):
- `brands`, `email_accounts`, `threads`, `messages`, `attachments`, `drafts`, `labels`, `thread_labels`, `sync_log`
- All indexes as specified (thread/brand/received_at, message_id_header, etc.)
- Auto-update trigger for `updated_at` columns

**Storage bucket**: `brand-logos` (public read, authenticated write)

**Vault integration** — Migadu password never reaches the frontend:
- RPC `upsert_email_account_password(account_id uuid, new_password text)` — service-role function that creates/updates a `vault.secrets` entry and stores the `vault_secret_id` on `email_accounts`
- RPC `get_vault_secret(secret_id uuid)` — service-role only, used by edge functions

**Seed data**: On first load, if `brands` is empty, insert the 9 brands (SellQo, VanXcel, Loveke, Studio Akke, AigenTo, Toog, Mancini Milano, De Fiere Margriet, Nomadix BV) with the provided slugs/colors/emails as placeholders.

**Edge function `test-email-connection`**:
- Accepts `{ account_id }`, requires authenticated user
- Pulls password from Vault via service role
- Uses `imapflow` to connect → open INBOX → logout
- Returns `{ ok: true, mailbox_size }` or `{ ok: false, error }`

## 2. Auth

- Email/password via Lovable Cloud (auto-confirm enabled so I can sign in immediately)
- `/auth` page: simple sign-in form (sign-up hidden — I'll create my account once, then it's effectively single-user)
- `ProtectedRoute` wrapper using `onAuthStateChange` + `getSession`
- `/` redirects to `/inbox` if logged in, else `/auth`
- `/inbox` = placeholder ("Coming in phase 3")
- `/settings` = the real Phase 1 UI

## 3. UI — `/settings` with 3 tabs

**Layout**: Dark theme by default (slate palette), Inter font, shadcn/ui throughout, compact density. Top bar with Nomadix label + sign-out button.

### Tab 1 — Brands
- Table: color swatch · name · email · active toggle · drag handle · edit · delete
- Drag-to-reorder (writes `sort_order`)
- "Add brand" / "Edit brand" modal:
  - slug, name, email_address, display_name
  - color picker for `color_primary`
  - Logo upload → `brand-logos` bucket
  - Signature: textarea (HTML) + live preview pane below
- Delete confirmation dialog

### Tab 2 — Email Account
- Single-account form (creates if none exists, edits if one does):
  - label, imap_host (default `imap.migadu.com`), imap_port (993), TLS toggle
  - smtp_host (`smtp.migadu.com`), smtp_port (465), TLS toggle
  - username, password (write-only field — placeholder shows "•••••• stored in Vault" when set)
- Saving the password calls the `upsert_email_account_password` RPC
- Read-only status panel: `last_sync_at`, `last_sync_status` (badge), `last_sync_error`
- "Test connection" button → calls `test-email-connection` edge function → toast with mailbox size or error

### Tab 3 — Labels
- Simple CRUD list: name + color picker, add/edit/delete inline

## 4. Design system

- Update `index.css` + `tailwind.config.ts` so dark mode is the default
- Slate-based neutral palette, semantic tokens for surface/border/muted
- Brand color tokens consumed via CSS variables for future per-brand accenting

## Acceptance (Phase 1)
- ✅ Sign in with email/password
- ✅ See 9 seeded brands on `/settings`, full CRUD + reorder
- ✅ Configure Migadu account (host, port, username, password)
- ✅ Password stored in Vault, never returned to frontend
- ✅ "Test connection" verifies IMAP login on Migadu
- ✅ All 9 tables exist with correct RLS + indexes

