import { randomInt } from "crypto";

export const TZ = process.env.SITE_TZ || "America/New_York";
export const CLASSES = ["Undecided", "Artificer", "Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"];
export const DAY = 86400000;
export const PRIORITY_WINDOW_DAYS = 5;
export const POSTPONE_LEAD_DAYS = 10;
export const ITEM_TYPES = ["consumable", "equipable"] as const;

const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";
export const code = (n: number) => Array.from({ length: n }, () => ALPHA[randomInt(ALPHA.length)]).join("");

export const fmt = (d: Date) => d.toLocaleString("en-US", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });

// Converts a <input type="datetime-local"> value (site time zone) to a UTC Date.
export function zonedToUtc(local: string, tz = TZ): Date {
  const asUtc = new Date(local + "Z");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(asUtc).map((p) => [p.type, p.value])
  );
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(asUtc.getTime() - (shown - asUtc.getTime()));
}

// "3d 4h", "5h 12m", "9m" - how long until a date.
export function timeLeft(d: Date, now = new Date()) {
  const ms = d.getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440), hrs = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (days) return `${days}d ${hrs}h`;
  if (hrs) return `${hrs}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

export type DoorState = "locked" | "priority" | "open" | "full" | "postponed";
// Computed per viewer from time + priority + overrides. Nothing per-player is stored.
export function doorState(
  q: { status: string; manualLock: boolean; prioritySignupAt: Date; generalSignupAt: Date; maxPlayers: number },
  count: number, hasPriority: boolean, now = new Date()
): DoorState {
  if (q.status === "postponed") return "postponed";
  if (count >= q.maxPlayers) return "full";
  if (q.manualLock) return "locked";
  if (now >= q.generalSignupAt) return "open";
  if (now >= q.prioritySignupAt && hasPriority) return "priority";
  return "locked";
}

// A player with priority (or a redeemed key) can get into a quest that is "locked" only because
// sign-ups haven't opened yet. An admin's manual lock still blocks everyone.
export function priorityUnlocked(
  q: { status: string; manualLock: boolean; maxPlayers: number },
  st: DoorState, count: number, hasPriority: boolean
): boolean {
  return hasPriority && st === "locked" && !q.manualLock && q.status === "active" && count < q.maxPlayers;
}