// POST /api/post-event — write a new event directly to events/published/<id>
// No approval step. Gate is the primary barrier; honeypot + rate-limit here.
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const CATEGORIES = [
  "Block Party", "Game Watch", "Garage Sale",
  "Meeting", "Kids", "Volunteer", "Social", "Other",
];

// Simple in-memory rate limiter (per function instance). Good enough for the load.
const ipCounts = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT = 5;       // max posts per window
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRate(ip) {
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export default async (request, context) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ip =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown";

  if (!checkRate(ip)) {
    return Response.json({ error: "Too many posts. Please wait a few minutes." }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Honeypot — bots fill this in, humans don't
  if (body.honeypot) {
    // Silently succeed so bots don't know they were caught
    return Response.json({ ok: true, id: "000" }, { status: 200 });
  }

  const { title, category, startDateTime, hostName } = body;

  if (!title?.trim()) return Response.json({ error: "Title is required." }, { status: 400 });
  if (!CATEGORIES.includes(category)) return Response.json({ error: "Invalid category." }, { status: 400 });
  if (!startDateTime || isNaN(Date.parse(startDateTime))) return Response.json({ error: "Valid start date is required." }, { status: 400 });
  if (!hostName?.trim()) return Response.json({ error: "Host name is required." }, { status: 400 });

  const id = randomUUID();
  const event = {
    id,
    title: String(title).trim().slice(0, 120),
    category,
    description: body.description ? String(body.description).trim().slice(0, 1000) : undefined,
    allDay: !!body.allDay,
    startDateTime,
    endDateTime: body.endDateTime || undefined,
    locationName: body.locationName ? String(body.locationName).trim().slice(0, 120) : undefined,
    locationAddress: body.locationAddress ? String(body.locationAddress).trim().slice(0, 200) : undefined,
    hostName: String(hostName).trim().slice(0, 60),
    hostContact: body.hostContact ? String(body.hostContact).trim().slice(0, 100) : undefined,
    rsvpCount: 0,
    rsvps: [],
    createdAt: new Date().toISOString(),
  };

  const store = getStore({ name: "events", consistency: "strong" });
  await store.setJSON(`events/published/${id}`, event);

  return Response.json({ ok: true, id }, { status: 201 });
};

export const config = { path: "/api/post-event" };
