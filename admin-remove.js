// netlify/functions/admin-remove.js
//
// Admin-only endpoint. Soft-deletes an event or bulletin post by moving it from
// the "published" prefix to the "removed" prefix, stamped with which admin did it
// and when — so you keep an audit trail and can undo.
//
// Auth: this uses the CLASSIC handler signature on purpose. When the request
// carries a valid Netlify Identity JWT in the Authorization header
// (Authorization: Bearer <token>), Netlify validates it and populates
// context.clientContext.user. No token (or invalid) → no user → we reject.
//
// Set Netlify Identity to "Invite only" so only your named admins ever have accounts.

const { connectLambda, getStore } = require("@netlify/blobs");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // Identity check — Netlify fills this in from a valid Bearer token.
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return json(401, { error: "Unauthorized — admin login required" });
  }

  // Required when using Blobs from a classic (Lambda-compat) handler.
  connectLambda(event);

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const { type, id } = body;
  if (!["events", "bulletin"].includes(type) || !id) {
    return json(400, { error: "Body must include type ('events'|'bulletin') and id" });
  }

  const store = getStore(type);
  const publishedKey = `${type}/published/${id}`;

  const record = await store.get(publishedKey, { type: "json" });
  if (!record) {
    return json(404, { error: "Not found (already removed?)" });
  }

  const removed = {
    ...record,
    removedBy: user.email || user.user_metadata?.full_name || "admin",
    removedAt: new Date().toISOString(),
  };

  await store.setJSON(`${type}/removed/${id}`, removed);
  await store.delete(publishedKey);

  return json(200, { ok: true, type, id, removedBy: removed.removedBy });
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj),
  };
}
