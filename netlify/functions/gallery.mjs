// GET /api/gallery — return curated photo albums (admin-managed)
import { getStore } from "@netlify/blobs";

export default async (_request, _context) => {
  const store = getStore("gallery");
  const { blobs } = await store.list({ prefix: "gallery/albums/" });

  const albums = [];
  for (const b of blobs) {
    const a = await store.get(b.key, { type: "json" });
    if (a) albums.push(a);
  }

  albums.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

  return Response.json(albums, { headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/gallery" };
