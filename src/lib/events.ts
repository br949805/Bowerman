export const CATEGORIES = [
  "Block Party",
  "Game Watch",
  "Garage Sale",
  "Meeting",
  "Kids",
  "Volunteer",
  "Social",
  "Other",
] as const;

export type Category = typeof CATEGORIES[number];

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  "Block Party":  { bg: "#fff3e0", text: "#b45309" },
  "Game Watch":   { bg: "#eff6ff", text: "#1d4ed8" },
  "Garage Sale":  { bg: "#fefce8", text: "#a16207" },
  "Meeting":      { bg: "#eef2ff", text: "#4338ca" },
  "Kids":         { bg: "#fdf2f8", text: "#9d174d" },
  "Volunteer":    { bg: "#f0fdf9", text: "#0f766e" },
  "Social":       { bg: "#faf5ff", text: "#7e22ce" },
  "Other":        { bg: "#f1f5f9", text: "#475569" },
};

export function categoryStyle(cat: string): { bg: string; text: string } {
  return CAT_COLORS[cat] ?? CAT_COLORS["Other"];
}

export function formatEventDate(
  start: string,
  end?: string,
  allDay?: boolean,
): string {
  const s = new Date(start);
  if (allDay) {
    const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "long", day: "numeric" };
    if (!end || end === start) return s.toLocaleDateString("en-US", opts);
    const e = new Date(end);
    return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
  }
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "short", month: "long", day: "numeric" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const dateStr = s.toLocaleDateString("en-US", dateOpts);
  const timeStr = s.toLocaleTimeString("en-US", timeOpts);
  if (!end) return `${dateStr} at ${timeStr}`;
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();
  const endTime = e.toLocaleTimeString("en-US", timeOpts);
  return sameDay
    ? `${dateStr} · ${timeStr}–${endTime}`
    : `${dateStr} at ${timeStr} – ${e.toLocaleDateString("en-US", dateOpts)} at ${endTime}`;
}

export function makeICS(event: {
  id: string;
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime?: string;
  allDay?: boolean;
  locationName?: string;
  locationAddress?: string;
}): string {
  function toICSDate(iso: string, allDay?: boolean) {
    const d = new Date(iso);
    if (allDay) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}${m}${day}`;
    }
    return d.toISOString().replace(/[-:]/g, "").replace(".000", "");
  }

  const dtstart = event.allDay
    ? `DTSTART;VALUE=DATE:${toICSDate(event.startDateTime, true)}`
    : `DTSTART:${toICSDate(event.startDateTime)}`;

  const dtend = event.endDateTime
    ? event.allDay
      ? `DTEND;VALUE=DATE:${toICSDate(event.endDateTime, true)}`
      : `DTEND:${toICSDate(event.endDateTime)}`
    : "";

  const location = [event.locationName, event.locationAddress].filter(Boolean).join(", ");
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(".000", "");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bowerman Neighborhood//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@bowerman.neighborhood`,
    `DTSTAMP:${now}`,
    dtstart,
    dtend,
    `SUMMARY:${event.title.replace(/,/g, "\\,")}`,
    event.description ? `DESCRIPTION:${event.description.replace(/\n/g, "\\n").replace(/,/g, "\\,")}` : "",
    location ? `LOCATION:${location.replace(/,/g, "\\,")}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}

export function googleCalendarURL(event: {
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime?: string;
  allDay?: boolean;
  locationName?: string;
  locationAddress?: string;
}): string {
  function gcalDate(iso: string, allDay?: boolean) {
    const d = new Date(iso);
    if (allDay) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}${m}${day}`;
    }
    return d.toISOString().replace(/[-:]/g, "").replace(".000", "");
  }
  const start = gcalDate(event.startDateTime, event.allDay);
  const end = event.endDateTime ? gcalDate(event.endDateTime, event.allDay) : start;
  const location = [event.locationName, event.locationAddress].filter(Boolean).join(", ");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    ...(event.description ? { details: event.description } : {}),
    ...(location ? { location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
