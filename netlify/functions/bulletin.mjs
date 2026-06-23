// GET /api/bulletin — return all published bulletin posts, newest first
import { getStore } from "@netlify/blobs";

export default async (_request, _context) => {
  const store = getStore("bulletin");
  const { blobs } = await store.list({ prefix: "bulletin/published/" });

  const posts = [];
  for (const b of blobs) {
    const p = await store.get(b.key, { type: "json" });
    if (p) posts.push(p);
  }

  posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return Response.json(posts, { headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/bulletin" };
