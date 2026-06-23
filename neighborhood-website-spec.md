# Neighborhood Community Website — Build Spec

> A spec sheet for Claude Code. Hand this over as the project brief. It defines goals, stack, information architecture, feature set (tiered by priority), data models, and a suggested build order. Anything marked **[DECISION]** is still open and should be confirmed during the build. Decisions already locked are noted as **[LOCKED]**.

---

## 1. Overview

A website for a small, close-knit residential neighborhood that already does block parties, game watches, and group activities together. The site's job is to make it easy to (a) see what's coming up, (b) let any neighbor post an event, and (c) deepen the community with lightweight, friendly tools — without becoming a heavyweight social network or HOA portal.

**Design ethos:** warm, simple, fast, low-maintenance. A neighbor should find "what's happening this weekend" in one tap, and post a cookout in under a minute. Admin overhead should be near zero.

**Non-goals:** no ad-supported model, no algorithmic feed, no native mobile app, no payments (v1), no public exposure of resident personal data, **no resident accounts** (v1 — see auth model).

---

## 2. Users & roles

| Role | Who | Auth | Can do |
|---|---|---|---|
| **Visitor / Resident** | Anyone with the shared neighborhood passphrase | **Shared passphrase** (cookie via Edge Function) — no account, pseudonymous (types a display name when posting) | View the site; post events; post to the bulletin board; RSVP; claim potluck/volunteer slots |
| **Admin** | 1–3 trusted neighbors | **Traditional individual accounts** via Netlify Identity, **invite-only** | Everything above, plus: remove or edit any event/bulletin post, manage the photo gallery. Removals are attributable to the admin who made them. |

**[LOCKED] Auth model:**
- **Residents:** one shared neighborhood passphrase. An Edge Function validates it and sets a cookie. No accounts, no per-person identity, no directory in v1.
- **Admins:** Netlify Identity with registration set to **Invite only**, so only the named admins ever get accounts. `/admin` and all admin-only endpoints are gated by the Identity JWT (optionally an `admin` role on the token). Residents never see Identity.

**[LOCKED] No approval flow.** Anyone with the passphrase can post events and bulletin items, and they **publish immediately**. There is no pending/moderation queue. Admins moderate **after the fact** by removing or editing content.

**[LOCKED] Read gating — whole-site.** The passphrase gates **viewing and posting**: an Edge Function runs on `/*` and shows a self-contained unlock page to anyone without a valid access cookie. This keeps the calendar (which reveals when homes are empty) out of public view. **Admins also enter the passphrase**, then log in with their Identity account for admin powers — this avoids carving the admin area out of the gate (which would leave its assets ungated) and adds defense in depth. Scaffolding for this is built: see `scaffolding/` (`gate.ts`, `admin-remove.js`, `events.mjs`, `admin/index.astro`).

---

## 3. Tech stack & hosting

| Concern | Choice | Rationale |
|---|---|---|
| **Framework** | **Astro** | Static-first, content collections (markdown/JSON in-repo), partial-hydration islands for the few interactive bits. First-class Netlify support. |
| **Hosting** | **Netlify** (chosen) | Static hosting + Functions + Edge Functions + Blobs + Identity in one place. |
| **Curated content** | **Flat files in repo** (markdown + JSON via Astro content collections) | Version-controlled, PR-reviewable, zero infra. About page, neighborhood info, the curated photo gallery. |
| **Dynamic data** | **Netlify Blobs** (key-value) via Netlify Functions | Zero-config persistence for events, bulletin posts, RSVPs, poll votes. No DB to run. |
| **Upgrade path** | **Netlify DB (Neon Postgres)** | If/when relational queries or heavier volume are needed. Not required for v1. |
| **Resident auth** | Shared passphrase via **Edge Function** + cookie | See §2. |
| **Admin auth** | **Netlify Identity** (invite-only) | Real per-person accounts, password reset, revocation, attribution; minimal custom code. |
| **Email (digests/optional alerts)** | A transactional provider (Resend, Postmark, or Buttondown) called from a Function | For the weekly digest (Phase 2). |
| **Maps (optional)** | Leaflet + OpenStreetMap | No API key, free. |
| **Styling** | Tailwind or vanilla CSS w/ tokens | Owner's call; keep it light. |

### Data-shape conventions (Netlify Blobs)

Named stores with prefixed keys so `list({ prefix })` can fetch collections. Last-write-wins is acceptable at this scale. Because there is **no approval flow**, posts write straight to the published prefix; removals are **soft-deletes** into a `removed/` prefix so there's an audit trail of who removed what.

```
store: "events"
  events/published/<eventId>   -> Event JSON (live the moment it's posted)
  events/removed/<eventId>     -> Event JSON + { removedBy, removedAt } (admin soft-delete)

store: "bulletin"
  bulletin/published/<postId>  -> Post JSON (live immediately)
  bulletin/removed/<postId>    -> Post JSON + { removedBy, removedAt }

store: "polls"                 // Phase 3
  polls/<pollId>               -> Poll JSON (options + tallies)
```

> Blobs is key-value, not relational — no server-side querying or joins. Keep records self-contained; filter/sort in function code. Any store dumps cleanly to flat JSON for offline analysis (e.g., DuckDB) if you ever want attendance trends.

---

## 4. Information architecture (sitemap)

```
/                     Home — hero + next 3 upcoming events + quick links
/calendar             Month + list views, category filters
/events/[id]          Event detail (RSVP, potluck/volunteer signup, map, host)
/post-event           Post-an-event form (passphrase-gated; publishes immediately)
/bulletin             Community bulletin board (post immediately; admin can remove)
/gallery              Curated photo gallery of past events (admin-managed)
/resources            Trash/recycling schedule, local info, vetted recommendations (Phase 3)
/about                Neighborhood story, optional boundary map, who-organizes-what
/admin                Admin content management — remove/edit any content, manage gallery (Identity-gated)
```

Global nav: Home · Calendar · Bulletin · Gallery · About. Footer: Post an Event, Resources, Admin.

> **Deferred to a later phase:** resident directory (requires resident accounts, which v1 intentionally avoids).

---

## 5. Features

Tiered: build **MVP** first as a coherent, shippable site; **Phase 2/3** are independently addable.

### MVP — ship this first

#### 5.1 Community calendar
- Month grid view and an agenda/list view; toggle between them.
- Filter by **category** (Block Party, Game Watch, Garage Sale, Meeting, Kids, Volunteer, Social, Other) with color coding.
- Reads from `events/published/*`. **[DECISION]** prefer a Function-backed `/api/events` endpoint so new posts appear instantly without a rebuild.
- Empty state: "Nothing scheduled yet — be the first to add something!" linking to `/post-event`.
- Acceptance: a neighbor sees all upcoming events in both views, can filter by category, and can click into any event.

#### 5.2 Event detail page
- Title, description, date/time (all-day + multi-day support), location (name + address, optional map pin), host display name + optional contact, category, optional image.
- **RSVP / headcount:** "Count me in" control incrementing a going-count, optional name + party size, persisted in the event blob. Show current headcount.
- **Add to calendar:** generate an `.ics` download and a Google Calendar link.
- Acceptance: RSVP persists across reloads; headcount is accurate; `.ics` opens in a calendar app.

#### 5.3 Post an event (passphrase-gated, publishes immediately)
- Fields: title, description, category, start/end datetime, all-day toggle, location name + address, host display name, optional contact, optional image, optional recurrence note.
- On submit → write directly to `events/published/<id>`. **No approval step.**
- **Abuse protection:** the passphrase gate is the primary barrier; add a honeypot field and a light per-IP rate limit. Optional hCaptcha only if spam appears.
- Confirmation: "Posted! It's on the calendar now."
- Acceptance: a passphrase-holder can post an event and see it live on the calendar immediately; non-holders cannot post.

#### 5.4 Admin content management (Identity-gated) — `/admin`
- Login via Netlify Identity (invite-only). Lists all live events and bulletin posts.
- **Remove** → soft-delete into the `removed/` prefix, stamped with `removedBy` (admin email/name) + `removedAt`. **Edit** any event or post in place.
- Gallery management (see 5.8) lives here too.
- Acceptance: only invited admins can reach `/admin`; removing content takes it off the public site; removals are attributable.

#### 5.5 Home page
- Hero with neighborhood identity.
- "Next up" — next 3 upcoming events as cards.
- Quick links: Post an Event, Full Calendar, Bulletin.
- Optional: countdown to the next big event; current weather + sunset time (nice for evening cookouts).

---

### Phase 2 — community depth

#### 5.6 Bulletin board
- Posts in categories: **Announcement**, **Lost & Found**, **Borrow/Lend**, **Recommendation**, **For Sale/Free**, **General**.
- Passphrase-gated to post; **publishes immediately** (no approval). Poster supplies a display name.
- Admins can remove/edit any post. Posts auto-archive after N days to stay fresh.
- Acceptance: a passphrase-holder posts a notice and it appears immediately on `/bulletin`; admins can remove anything.

#### 5.7 Potluck & volunteer signups
- Attachable to any event: claimable slots ("Bring a side," "Bring drinks," "Help set up," "Bring chairs").
- Show who's claimed what; last-write-wins on claims is fine.
- Acceptance: on a potluck-enabled event, neighbors can claim/unclaim slots and see the live list.

#### 5.8 Curated photo gallery **[LOCKED: curated]**
- Per-event or general albums of past gatherings. **Admins add photos** (via `/admin`); no resident upload in v1 — avoids photo-consent and moderation overhead.
- Acceptance: visitors browse albums; images are responsive and lazy-loaded; admins can add/remove photos.

#### 5.9 Weekly email digest
- Opt-in signup. A Scheduled Function compiles the coming week's events (+ recent bulletin posts) and sends via the email provider.
- Acceptance: subscribers get a weekly summary; unsubscribe works.

#### 5.10 Game-watch hub
- A focused, filtered view of game-watch events (game, kickoff, host/location, BYO notes, headcount). Implement as a calendar category + filtered view rather than a separate system.

---

### Phase 3 — delight & extras

- **Polls / voting** — "When's the next block party?" Options + tallies in the `polls` store.
- **Resources page** — trash/recycling schedule, snow/leaf pickup, local numbers, neighbor-vetted contractors/sitters.
- **Tool/lend library** — standing registry of "things neighbors will lend," searchable, with a contact path.
- **Contest module** — yard-of-the-month / holiday-lights: photo submissions + voting + winners archive.
- **New-neighbor welcome flow** — an "introduce yourself" path that posts a friendly welcome to the bulletin.
- **Safety/alerts opt-in** — a deliberately simple notice channel for time-sensitive alerts.
- **Resident directory** — deferred; requires resident accounts (revisit if you later adopt Identity for residents).

---

## 6. Non-functional requirements

- **Performance:** static-first; Lighthouse ≥ 90 on mobile. Lazy-load images; hydrate only interactive islands.
- **Accessibility:** semantic HTML, labeled inputs, `aria-live` for async results (RSVP, posting), keyboard-reachable controls with visible focus, contrast ≥ WCAG AA. Calendar navigable without a mouse.
- **Responsive:** mobile-first; most neighbors visit on a phone.
- **Privacy:** no resident PII on public pages; honor the read-gating decision (§2); plain-language privacy note. Bulletin/event posts are pseudonymous (display name only).
- **SEO/sharing:** sensible titles + Open Graph tags so shared event links preview nicely. If viewing is passphrase-gated, set gated pages `noindex`.
- **Resilience:** graceful empty/loading/error states wherever data is fetched.
- **Maintainability:** all admin tasks doable by a non-developer neighbor from `/admin`.

---

## 7. Netlify configuration

- `netlify.toml`: Astro build command + publish dir; Functions dir `netlify/functions`; Edge Functions for the passphrase gate.
- **Resident gate (whole-site):** an Edge Function (`netlify/edge-functions/gate.ts`) runs on `/*` and intercepts every request. No valid cookie → it serves a self-contained unlock page; correct passphrase → it sets a signed, HttpOnly cookie (a 30-day HMAC token, not the raw passphrase) and lets the request continue via `context.next()`. Only `/.netlify/identity/*` is excluded, so admin login works. Because the gate covers everything, all data endpoints (`/api/*`) are protected automatically — no per-endpoint checks needed.
- **Admin auth:** enable **Netlify Identity** with registration **Invite only**; invite the admins. Admins pass the resident gate, then log in on `/admin`. Admin Functions (e.g. `admin-remove.js`) use the classic handler so Netlify populates `context.clientContext.user` from the Identity Bearer token; reject when absent.
- **Cookie/passphrase rotation:** change `RESIDENT_PASSPHRASE` to require re-entry; change `SESSION_SECRET` to additionally invalidate all existing cookies immediately.
- **Env vars:** `RESIDENT_PASSPHRASE`, `SESSION_SECRET` (signs the access cookie — generate a long random string); email provider API key (Phase 2); any map config. (No admin passphrase — admins use Identity.)
- **Domain:** point the purchased domain at Netlify (Netlify DNS or external records); enable automatic HTTPS (Let's Encrypt) and force-HTTPS.
- **Blobs:** no setup — `getStore()` works from Functions/Edge Functions at runtime. Use `consistency: "strong"` where immediate read-after-write matters (showing a post or RSVP right after it's made).

---

## 8. Seed / sample data

Include seed events (a block party, a game watch, a garage-sale weekend) and 2–3 bulletin posts so the site never demos empty. Provide as JSON the build can load into Blobs on first run, or a one-time seed script.

---

## 9. Suggested build order

1. **Scaffold** — Astro + Netlify config, layout, nav, home shell; deploy to the domain.
2. **Calendar + event detail** — read from seeded `events/published/*`; month + list views; `.ics`/Google links.
3. **Resident passphrase gate** — drop in `gate.ts`; whole-site, set `RESIDENT_PASSPHRASE` + `SESSION_SECRET`.
4. **Post an event** — writes straight to `events/published/*` (no approval); honeypot + rate limit.
5. **RSVP** — headcount on event detail.
6. **Admin** — enable Netlify Identity (invite-only); build `/admin` with remove (soft-delete + attribution) and edit.
7. **Polish MVP** — empty/error states, mobile + a11y passes, OG tags, seed content. **Ship.**
8. **Phase 2** — bulletin board → potluck signups → curated gallery → weekly digest → game-watch view.
9. **Phase 3** — polls, resources, lend library, contests, welcome flow, alerts — as desired.

---

## 10. Decisions

**Locked:**
- Resident auth = shared passphrase, no accounts. (§2)
- **Read gating = whole-site** — passphrase required to view *and* post; admins also pass it, then log in via Identity. (§2, §7)
- Admin auth = Netlify Identity, invite-only, traditional individual accounts. (§2)
- No approval/moderation flow — events & bulletin publish immediately; admins remove/edit after the fact. (§2, §5)
- Photo gallery = curated/admin-managed, no resident upload. (§5.8)
- Resident directory = deferred. (§5)

**Still open:**
1. **Calendar freshness** — Function-backed live endpoint vs. rebuild. (§5.1)
2. **Email provider** — Resend / Postmark / Buttondown (Phase 2). (§3)
3. **Neighborhood identity** — name, colors, logo/wordmark, whether to show a boundary map.
4. **Public discoverability** — since the whole site is behind the passphrase, decide whether even the unlock page / public pages should be `noindex`. (§6)
