#!/usr/bin/env node
// Run: netlify dev & sleep 3 && node scripts/seed.mjs
// Or just: node scripts/seed.mjs (with NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN set)
//
// Seeds Blobs with sample events and bulletin posts so the site never demos empty.
// Safe to run multiple times — uses fixed IDs so it won't create duplicates.

import { getStore } from "@netlify/blobs";

// Hard-coded IDs so we don't create duplicates on re-runs
const EVENTS = [
  {
    id: "seed-event-1",
    title: "Summer Block Party",
    category: "Block Party",
    description: "Annual block party on Bowerman Drive! Live music, lawn games, a potluck spread, and good company. Bring a dish to share and your lawn chairs.",
    allDay: false,
    startDateTime: offsetDate(7, 16, 0),   // 7 days from now at 4pm
    endDateTime:   offsetDate(7, 21, 0),   // ends at 9pm
    locationName: "Bowerman Drive Cul-de-Sac",
    locationAddress: "Bowerman Dr",
    hostName: "The Nguyen Family",
    rsvpCount: 14,
    rsvps: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-event-2",
    title: "NFL Sunday Watch Party",
    category: "Game Watch",
    description: "Catch the game at Mike's place. Big screen, cold drinks, and good snacks. BYO team jersey encouraged. Kickoff at 1pm — come early for warmups!",
    allDay: false,
    startDateTime: offsetDate(3, 12, 0),
    endDateTime:   offsetDate(3, 17, 0),
    locationName: "Mike & Carol's",
    locationAddress: "14 Bowerman Dr",
    hostName: "Mike Thompson",
    hostContact: "mike@example.com",
    rsvpCount: 8,
    rsvps: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-event-3",
    title: "Multi-Family Garage Sale",
    category: "Garage Sale",
    description: "Three families combining for a big spring clean-out. Furniture, kids' gear, tools, kitchen stuff, books, and plenty of treasures. Early birds welcome!",
    allDay: true,
    startDateTime: offsetDate(14, 8, 0),
    endDateTime:   offsetDate(15, 14, 0),
    locationName: "Multiple driveways",
    locationAddress: "7, 9, and 12 Bowerman Dr",
    hostName: "The Garcias, Smiths & Lees",
    rsvpCount: 0,
    rsvps: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-event-4",
    title: "Kids Bike Parade",
    category: "Kids",
    description: "Decorate your bikes and scooters for a slow parade around the neighborhood! All ages welcome. We'll hand out ribbons for most creative, fastest, and most spirited.",
    allDay: false,
    startDateTime: offsetDate(10, 10, 0),
    endDateTime:   offsetDate(10, 11, 30),
    locationName: "Corner of Bowerman & Oak",
    hostName: "PTA Volunteers",
    rsvpCount: 22,
    rsvps: [],
    createdAt: new Date().toISOString(),
  },
];

const BULLETIN = [
  {
    id: "seed-bulletin-1",
    title: "Lost: orange tabby cat (Mango)",
    body: "Our cat Mango got out on Friday evening. He's a neutered male, very friendly, orange tabby with a blue collar. Last seen near the park. Please call or text if you see him!",
    category: "Lost & Found",
    authorName: "Priya R.",
    contactEmail: "priya@example.com",
    createdAt: new Date(Date.now() - 1 * 24 * 3600_000).toISOString(),
  },
  {
    id: "seed-bulletin-2",
    title: "Lawnmower available to borrow",
    body: "Happy to lend our push mower to any neighbor who needs it. Just send me a message first so I know you're coming. Drop it back with a full tank of gas. 😄",
    category: "Borrow/Lend",
    authorName: "Dave K.",
    createdAt: new Date(Date.now() - 3 * 24 * 3600_000).toISOString(),
  },
  {
    id: "seed-bulletin-3",
    title: "Highly recommend Tim's Tree Service",
    body: "Had Tim out to take down a big oak and clean up two others. Extremely professional, fair price, and the cleanup was immaculate. Not sponsored — just a really good experience worth sharing.",
    category: "Recommendation",
    authorName: "Carol & Jim W.",
    createdAt: new Date(Date.now() - 5 * 24 * 3600_000).toISOString(),
  },
];

function offsetDate(days, hours, minutes) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

async function seed() {
  console.log("Seeding events…");
  const events = getStore({ name: "events", consistency: "strong" });
  for (const ev of EVENTS) {
    const key = `events/published/${ev.id}`;
    const existing = await events.get(key);
    if (existing) {
      console.log(`  skip (exists): ${ev.title}`);
      continue;
    }
    await events.setJSON(key, ev);
    console.log(`  seeded: ${ev.title}`);
  }

  console.log("Seeding bulletin…");
  const bulletin = getStore({ name: "bulletin", consistency: "strong" });
  for (const post of BULLETIN) {
    const key = `bulletin/published/${post.id}`;
    const existing = await bulletin.get(key);
    if (existing) {
      console.log(`  skip (exists): ${post.title}`);
      continue;
    }
    await bulletin.setJSON(key, post);
    console.log(`  seeded: ${post.title}`);
  }

  console.log("Done.");
}

seed().catch((err) => { console.error(err); process.exit(1); });
