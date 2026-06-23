# Scaffolding — neighborhood site auth + admin

Working bones for the two pieces of plumbing in the spec: the **whole-site passphrase gate** (residents) and the **Identity-gated admin** (admins). Drop these into an Astro project (or hand them to Claude Code as the starting point).

## What's here

```
netlify.toml                          build + functions wiring
.env.example                          the two required secrets
netlify/edge-functions/gate.ts        whole-site passphrase gate + unlock page
netlify/functions/admin-remove.js     admin-only soft-delete (Identity-gated)
netlify/functions/events.mjs          public (gated) read endpoint → /api/events
src/pages/admin/index.astro           admin login + list + remove skeleton
```

## The auth model (two independent layers)

1. **Residents — shared passphrase.** The edge function (`gate.ts`) runs on `/*`. No valid cookie → it serves a self-contained unlock page. Correct passphrase → it sets a signed, HttpOnly cookie (a 30-day HMAC token, *not* the passphrase itself) and lets them in. This gates **viewing and posting** — the whole site.
2. **Admins — Netlify Identity accounts.** Admins enter the passphrase like everyone else, then log in on `/admin` with their own email/password account. Admin endpoints verify the Identity JWT independently. Set Identity registration to **Invite only** so only your named admins ever get accounts.

Why admins also pass the passphrase: it keeps the gate simple (no carve-outs that would leave admin-page assets ungated) and adds defense in depth. Admins are residents anyway.

## Setup

1. **Secrets.** Generate a session secret and set both vars locally and in Netlify:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
   Local: copy `.env.example` → `.env`. Production: Netlify UI → Site settings → Environment variables (`RESIDENT_PASSPHRASE`, `SESSION_SECRET`).

2. **Dependencies.** In the Astro project:
   ```bash
   npm i @netlify/blobs
   npm i -D @netlify/edge-functions netlify-cli
   ```
   (`@netlify/edge-functions` is types-only; the runtime is provided by Netlify.)

3. **Enable Netlify Identity.** Netlify UI → Identity → Enable. Set **Registration = Invite only**. Invite your admin emails. (Identity is a supported auth option again as of Feb 2026.)

4. **Run locally** (the gate and functions only execute under Netlify Dev, not plain `astro dev`):
   ```bash
   netlify dev
   ```

5. **Domain + HTTPS.** Point your purchased domain at Netlify (Netlify DNS or external records), then enable automatic HTTPS + force-HTTPS in the UI.

## Notes & gotchas

- **`netlify dev` required.** Edge functions, `Netlify.env`, and Blobs don't run under `astro dev` alone.
- **events.mjs vs admin-remove.js.** `events.mjs` uses the modern v2 signature (Blobs works directly). `admin-remove.js` uses the classic handler on purpose — that's what populates `context.clientContext.user` from the Identity token — so it calls `connectLambda(event)` before using Blobs.
- **Data shape.** Events live at `events/published/<id>`; removal moves them to `events/removed/<id>` with `removedBy` + `removedAt`. Bulletin mirrors this (`bulletin/published/*`, `bulletin/removed/*`); admin-remove already accepts `type: "bulletin"`.
- **noindex.** The unlock page and `/admin` send `noindex`. Since the whole site sits behind the passphrase, you'll likely want public pages `noindex` too (decide based on whether you want the site discoverable at all).
- **Rotating the passphrase.** Change `RESIDENT_PASSPHRASE` to lock everyone out; change `SESSION_SECRET` to additionally invalidate all existing cookies immediately.
- **Still to build (per spec):** the post-event endpoint (writes to `events/published/*`), RSVP, bulletin post/list, calendar pages, and the curated gallery. The gate already protects all of them automatically.
