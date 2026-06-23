// netlify/functions/events.mjs
//
// Public (gate-protected) read endpoint. Returns all published events as JSON,
// sorted by start time. Because the Edge Function gates the whole site, only
// residents who entered the passphrase ever reach this — the data is protected.
//
// This uses the modern v2 function signature (export default (req, context) =>
// Response). v2 functions are NOT in Lambda-compat mode, so Blobs works directly
// without connectLambda().

import { getStore } from "@netlify/blobs";

export default async (_request, _context) => {
  const store = getStore("events");
  const { blobs } = await store.list({ prefix: "events/published/" });

  const events = [];
  for (const b of blobs) {
    const e = await store.get(b.key, { type: "json" });
    if (e) events.push(e);
  }

  events.sort(
    (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime(),
  );

  return Response.json(events, {
    headers: { "cache-control": "no-store" },
  });
};

export const config = { path: "/api/events" };
