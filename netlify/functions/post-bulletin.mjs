// POST /api/post-bulletin — publish a bulletin board post immediately
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const CATEGORIES = ["Announcement", "Lost & Found", "Borrow/Lend", "Recommendation", "For Sale/Free", "General"];

const ipCounts = new Map();
const RATE_LIMIT = 10;
const WINDOW_MS = 15 * 60 * 1000;

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

export default async (request, _context) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ip =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown";

  if (!checkRate(ip)) {
    return Response.json({ error: "Too many posts. Please wait." }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.honeypot) return Response.json({ ok: true, id: "000" });

  const { title, body: postBody, category, authorName } = body;
  if (!title?.trim()) return Response.json({ error: "Title is required." }, { status: 400 });
  if (!postBody?.trim()) return Response.json({ error: "Post body is required." }, { status: 400 });
  if (!CATEGORIES.includes(category)) return Response.json({ error: "Invalid category." }, { status: 400 });
  if (!authorName?.trim()) return Response.json({ error: "Display name is required." }, { status: 400 });

  const id = randomUUID();
  const post = {
    id,
    title: String(title).trim().slice(0, 120),
    body: String(postBody).trim().slice(0, 1000),
    category,
    authorName: String(authorName).trim().slice(0, 60),
    contactEmail: body.contactEmail ? String(body.contactEmail).trim().slice(0, 100) : undefined,
    createdAt: new Date().toISOString(),
  };

  const store = getStore({ name: "bulletin", consistency: "strong" });
  await store.setJSON(`bulletin/published/${id}`, post);

  return Response.json({ ok: true, id }, { status: 201 });
};

export const config = { path: "/api/post-bulletin" };
