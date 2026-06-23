// GET /api/events/:id — fetch a single published event
import { getStore } from "@netlify/blobs";

export default async (request, _context) => {
  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const store = getStore("events");
  const event = await store.get(`events/published/${id}`, { type: "json" });
  if (!event) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(event, { headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/events/:id" };
