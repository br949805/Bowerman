// POST /api/rsvp — increment the RSVP headcount for an event
import { getStore } from "@netlify/blobs";

export default async (request, _context) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { eventId, name, size } = body;
  if (!eventId) return Response.json({ error: "eventId is required" }, { status: 400 });

  const partySize = Math.max(1, Math.min(parseInt(size, 10) || 1, 20));

  const store = getStore({ name: "events", consistency: "strong" });
  const key = `events/published/${eventId}`;
  const event = await store.get(key, { type: "json" });

  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });

  event.rsvpCount = (event.rsvpCount ?? 0) + partySize;
  event.rsvps = event.rsvps ?? [];
  event.rsvps.push({
    name: name ? String(name).trim().slice(0, 60) : undefined,
    size: partySize,
    at: new Date().toISOString(),
  });

  await store.setJSON(key, event);

  return Response.json({ ok: true, rsvpCount: event.rsvpCount });
};

export const config = { path: "/api/rsvp" };
