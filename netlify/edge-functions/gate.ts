// netlify/edge-functions/gate.ts
//
// Whole-site passphrase gate. Runs on every request. If the visitor doesn't have
// a valid access cookie, they get a self-contained "unlock" page (no external
// assets, so there's no chicken-and-egg with gated CSS/JS). Submitting the correct
// neighborhood passphrase sets a signed, HttpOnly cookie and lets them in.
//
// Admins ALSO pass through this gate (they're residents too), then authenticate
// separately with their Netlify Identity account on /admin for admin powers.
//
// Required environment variables (set in Netlify UI → Site settings → Environment):
//   RESIDENT_PASSPHRASE  the shared neighborhood passphrase
//   SESSION_SECRET       a long random string used to sign the access cookie
//
// The cookie stores a signed token (HMAC of an expiry timestamp), NOT the
// passphrase itself, so it can't be forged and the secret never leaves the server.

import type { Config, Context } from "@netlify/edge-functions";

const COOKIE = "nb_access";
const MAX_AGE_DAYS = 30;
const MAX_AGE_SECONDS = MAX_AGE_DAYS * 24 * 60 * 60;

export default async (request: Request, context: Context) => {
  const secret = Netlify.env.get("SESSION_SECRET");
  const passphrase = Netlify.env.get("RESIDENT_PASSPHRASE");

  // Fail closed: if the gate isn't configured, don't accidentally let everyone in.
  if (!secret || !passphrase) {
    return new Response(
      "Site not configured. Set RESIDENT_PASSPHRASE and SESSION_SECRET in Netlify.",
      { status: 500, headers: { "content-type": "text/plain" } },
    );
  }

  const url = new URL(request.url);

  // 1) Handle the unlock form submission.
  if (request.method === "POST" && url.pathname === "/__unlock") {
    const form = await request.formData();
    const submitted = String(form.get("passphrase") ?? "");
    const next = safeNext(String(form.get("next") ?? "/"));

    if (await passphraseOk(secret, submitted, passphrase)) {
      const token = await makeToken(secret);
      const cookie =
        `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
      return new Response(null, {
        status: 303,
        headers: { Location: next, "Set-Cookie": cookie },
      });
    }
    // Wrong passphrase → re-show the unlock page with an error.
    return unlockResponse(next, "That passphrase didn't match. Try again.", 401);
  }

  // 2) Already unlocked? Let the request continue down the chain.
  const token = getCookie(request, COOKIE);
  if (token && (await verifyToken(secret, token))) {
    return context.next();
  }

  // 3) Locked → show the unlock page, remembering where they wanted to go.
  return unlockResponse(url.pathname + url.search, null, 200);
};

// Run on everything except the Identity (GoTrue) endpoints, which the Netlify
// Identity widget needs to reach directly for admin login/token refresh.
export const config: Config = {
  path: "/*",
  excludedPath: ["/.netlify/identity", "/.netlify/identity/*"],
};

/* ---------------------------- helpers ---------------------------- */

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function passphraseOk(secret: string, submitted: string, real: string): Promise<boolean> {
  if (!submitted || !real) return false;
  // Compare HMACs (fixed length) rather than raw strings.
  const a = await hmac(secret, submitted);
  const b = await hmac(secret, real);
  return timingSafeEqual(a, b);
}

async function makeToken(secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = String(exp);
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

async function verifyToken(secret: string, token: string): Promise<boolean> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(secret, payload);
  if (!timingSafeEqual(sig, expected)) return false;
  const exp = parseInt(payload, 10);
  return Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000);
}

// Only allow same-origin, single-slash internal paths as redirect targets.
function safeNext(v: string): string {
  if (!v || !v.startsWith("/") || v.startsWith("//")) return "/";
  return v;
}

function unlockResponse(next: string, error: string | null, status: number): Response {
  return new Response(unlockHTML(next, error), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function unlockHTML(next: string, error: string | null): string {
  const safe = next.replace(/"/g, "&quot;");
  const err = error
    ? `<p class="err" role="alert">${error}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Welcome, neighbor</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100dvh; display: grid; place-items: center;
      font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0; padding: 24px;
    }
    .card {
      width: 100%; max-width: 380px; background: #1e293b; border: 1px solid #334155;
      border-radius: 16px; padding: 28px; box-shadow: 0 10px 40px rgba(0,0,0,.35);
    }
    h1 { margin: 0 0 4px; font-size: 1.35rem; }
    p.sub { margin: 0 0 20px; color: #94a3b8; font-size: .95rem; }
    label { display: block; font-size: .85rem; color: #cbd5e1; margin-bottom: 6px; }
    input {
      width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #475569;
      background: #0f172a; color: #e2e8f0; font-size: 1rem;
    }
    input:focus { outline: 2px solid #38bdf8; outline-offset: 1px; }
    button {
      margin-top: 16px; width: 100%; padding: 12px 14px; border: 0; border-radius: 10px;
      background: #38bdf8; color: #082f49; font-size: 1rem; font-weight: 600; cursor: pointer;
    }
    button:hover { background: #7dd3fc; }
    .err { color: #fca5a5; font-size: .9rem; margin: 0 0 12px; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Welcome, neighbor 👋</h1>
    <p class="sub">Enter the neighborhood passphrase to view the site.</p>
    ${err}
    <form method="POST" action="/__unlock">
      <label for="passphrase">Neighborhood passphrase</label>
      <input id="passphrase" name="passphrase" type="password" autocomplete="current-password"
             autofocus required />
      <input type="hidden" name="next" value="${safe}" />
      <button type="submit">Enter</button>
    </form>
  </main>
</body>
</html>`;
}
