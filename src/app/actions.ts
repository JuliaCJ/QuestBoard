"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { COOKIE, requireAdmin, requireUser, startSession } from "@/lib/auth";
import { CLASSES, DAY, FIRST_QUEST_BONUS, PRIORITY_WINDOW_DAYS, TZ, doorState, fmt, zonedToUtc } from "@/lib/util";

type R = Promise<string | void>;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const done = (msg: string) => { revalidatePath("/", "layout"); return msg; };
const hasPriority = (u: { hasPriority: boolean; priorityUntil: Date | null }) => u.hasPriority || (!!u.priorityUntil && u.priorityUntil > new Date());

/* ---------- auth ---------- */
const attempts = new Map<string, { n: number; t: number }>(); // best-effort limiter (per server instance)
export async function login(fd: FormData): R {
  const username = s(fd, "username").toLowerCase();
  const now = Date.now();
  const a = attempts.get(username);
  const live = a && now - a.t < 15 * 60000 ? a : undefined;
  if (live && live.n >= 10) return "Too many attempts. Try again in 15 minutes.";
  const u = await db.user.findUnique({ where: { username } });
  if (!u || !u.isActive || !(await bcrypt.compare(String(fd.get("password") ?? ""), u.passwordHash))) {
    attempts.set(username, { n: (live?.n ?? 0) + 1, t: live?.t ?? now });
    return "Wrong username or password.";
  }
  attempts.delete(username);
  await startSession(u.id);
  redirect("/");
}
export async function logout() { await (await cookies()).delete(COOKIE); redirect("/login"); }

/* ---------- player ---------- */
export async function signUp(fd: FormData): R {
  const u = await requireUser();
  const questId = s(fd, "questId"), cls = s(fd, "className");
  if (!CLASSES.includes(cls)) return "Pick a class.";
  const msg = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Quest" WHERE id = ${questId} FOR UPDATE`; // serialises sign-ups per quest
    const q = await tx.quest.findUnique({ where: { id: questId } });
    if (!q) return "Quest not found.";
    const existing = await tx.signup.findUnique({ where: { questId_userId: { questId, userId: u.id } } });
    if (existing?.status === "signed_up") {
      await tx.signup.update({ where: { id: existing.id }, data: { className: cls } });
      return "Class updated.";
    }
    const count = await tx.signup.count({ where: { questId, status: "signed_up" } });
    const st = doorState(q, count, hasPriority(u));
    if (q.postAt > new Date() || (st !== "open" && st !== "priority")) return "Sign-ups aren't open to you for this quest.";
    if (existing) await tx.signup.update({ where: { id: existing.id }, data: { status: "signed_up", className: cls } });
    else await tx.signup.create({ data: { questId, userId: u.id, className: cls } });
    return "You're signed up.";
  });
  return done(msg);
}

export async function withdraw(fd: FormData): R {
  const u = await requireUser();
  await db.signup.updateMany({ where: { questId: s(fd, "questId"), userId: u.id, status: "signed_up" }, data: { status: "withdrawn" } });
  return done("You've withdrawn from this quest.");
}

export async function redeemKey(fd: FormData): R {
  const u = await requireUser();
  const key = await db.priorityKey.findUnique({ where: { code: s(fd, "code").toLowerCase() } });
  if (!key) return "That key doesn't exist.";
  if (key.redeemedById) return "That key has already been used.";
  if (key.expiresAt < new Date()) return "That key has expired.";
  const claimed = await db.priorityKey.updateMany({ where: { id: key.id, redeemedById: null }, data: { redeemedById: u.id, redeemedAt: new Date() } });
  if (!claimed.count) return "That key has already been used.";
  const until = u.priorityUntil && u.priorityUntil > key.expiresAt ? u.priorityUntil : key.expiresAt;
  await db.user.update({ where: { id: u.id }, data: { priorityUntil: until } });
  return done(`Priority access unlocked until ${fmt(until)}.`);
}

/* ---------- admin: players, renown, keys ---------- */
const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;
export async function createPlayer(fd: FormData): R {
  await requireAdmin();
  const displayName = s(fd, "displayName"), username = s(fd, "username").toLowerCase(), pw = String(fd.get("password") ?? "");
  const priority = fd.get("priority") === "on";
  if (!displayName) return "Enter a display name.";
  if (!USERNAME_RE.test(username)) return "Username must be 3-24 characters: letters, numbers, dot, dash or underscore.";
  if (await db.user.findUnique({ where: { username } })) return "That username is already taken.";
  await db.user.create({ data: { username, displayName, passwordHash: await bcrypt.hash(pw, 12), hasPriority: priority } });
  return done(`Created ${username}. Share the username and password you chose with the player.`);
}
export async function resetPassword(fd: FormData): R {
  await requireAdmin();
  const pw = String(fd.get("password") ?? "");
  await db.user.update({ where: { id: s(fd, "userId") }, data: { passwordHash: await bcrypt.hash(pw, 12) } });
  return "Password updated. Share the new password with the player.";
}
export async function setPriority(fd: FormData): R {
  await requireAdmin();
  await db.user.update({ where: { id: s(fd, "userId") }, data: { hasPriority: s(fd, "value") === "1" } });
  return done("Priority updated.");
}
export async function deactivate(fd: FormData): R {
  await requireAdmin();
  await db.user.updateMany({ where: { id: s(fd, "userId"), role: "player" }, data: { isActive: false } });
  return done("Player removed.");
}
export async function adjustRenown(fd: FormData): R {
  await requireAdmin();
  const userId = s(fd, "userId"), amount = parseInt(s(fd, "amount"), 10);
  if (!amount) return "Enter a non-zero amount.";
  return done(await db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } });
    if (!u || u.renown + amount < 0) return "Balance can't go below zero.";
    await tx.ledger.create({ data: { userId, amount, reason: "admin_adjust", note: s(fd, "note") || null } });
    await tx.user.update({ where: { id: userId }, data: { renown: { increment: amount } } });
    return `Renown ${amount > 0 ? "added" : "deducted"}.`;
  }));
}
export async function createKey(fd: FormData): R {
  await requireAdmin();
  const keyCode = s(fd, "code").toLowerCase();
  const days = parseInt(s(fd, "days"), 10) || 5;
  if (!/^[a-z0-9-]{4,32}$/.test(keyCode)) return "Key must be 4-32 characters: letters, numbers or dashes.";
  if (await db.priorityKey.findUnique({ where: { code: keyCode } })) return "A key with that code already exists.";
  const k = await db.priorityKey.create({ data: { code: keyCode, expiresAt: new Date(Date.now() + days * DAY) } });
  return done(`Key "${k.code}" created, valid until ${fmt(k.expiresAt)}.`);
}

/* ---------- admin: quests ---------- */
export async function createQuest(fd: FormData): R {
  await requireAdmin();

  const n = (k: string, d: number) => {
    const raw = s(fd, k);
    return raw === "" ? d : Number(raw);
  };

  const title = s(fd, "title");
  if (!title || !s(fd, "oneShot") || !s(fd, "general") || !s(fd, "priority")) {
    return "Title and all quest dates are required.";
  }

  const oneShotDate = zonedToUtc(s(fd, "oneShot"));
  const prioritySignupAt = zonedToUtc(s(fd, "priority"));
  const generalSignupAt = zonedToUtc(s(fd, "general"));
  const postAt = s(fd, "post") ? zonedToUtc(s(fd, "post")) : new Date();
  const minPlayers = n("min", 3);
  const maxPlayers = n("max", 6);
  const level = n("level", 1);
  const renownReward = n("renown", 0);

  if (
    ![oneShotDate, prioritySignupAt, generalSignupAt, postAt].every(
      (d) => Number.isFinite(d.getTime())
    ) ||
    prioritySignupAt >= generalSignupAt ||
    generalSignupAt >= oneShotDate ||
    minPlayers < 1 ||
    maxPlayers < minPlayers ||
    !Number.isInteger(minPlayers) ||
    !Number.isInteger(maxPlayers) ||
    !Number.isInteger(level) ||
    level < 1 ||
    !Number.isInteger(renownReward) ||
    renownReward < 0
  ) {
    return "Check the dates, player limits, level, and Renown reward.";
  }

  const q = await db.quest.create({
    data: {
      title,
      level,
      description: s(fd, "description"),
      renownReward,
      oneShotDate,
      prioritySignupAt,
      generalSignupAt,
      postAt,
      minPlayers,
      maxPlayers,
    },
  });

  return done(`Created "${q.title}".`);
}

export async function setLock(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");
  const locking = s(fd, "value") === "1";

  const result = await db.quest.updateMany({
    where: {
      id: questId,
      status: "active",
    },
    data: {
      manualLock: locking,
      ...(locking
        ? {}
        : {
            generalSignupAt: new Date(),
            postAt: new Date(),
          }),
    },
  });

  if (!result.count) return "Quest not found or is not active.";
  return done(locking ? "Quest locked." : "Quest unlocked. General sign-ups are open now.");
}

export async function rescheduleQuest(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");
  const rawDate = s(fd, "oneShot");

  if (!rawDate) return "Choose a new one-shot date.";

  const oneShotDate = zonedToUtc(rawDate);
  if (!Number.isFinite(oneShotDate.getTime())) return "Invalid one-shot date.";

  const result = await db.quest.updateMany({
    where: {
      id: questId,
      status: { in: ["active", "postponed"] },
    },
    data: { oneShotDate },
  });

  if (!result.count) return "Quest not found or cannot be rescheduled.";
  return done("One-shot date updated.");
}

export async function deferQuest(fd: FormData): R {
  await requireAdmin();

  const result = await db.quest.updateMany({
    where: { id: s(fd, "questId"), status: "active" },
    data: { status: "postponed", manualLock: true },
  });

  if (!result.count) return "Only active quests can be deferred.";
  return done("Quest deferred. It is hidden from players until reactivated.");
}

export async function reactivateQuest(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");
  const oneShot = s(fd, "oneShot");
  const priority = s(fd, "priority");
  const general = s(fd, "general");
  const post = s(fd, "post");

  if (!oneShot || !priority || !general) {
    return "One-shot, priority sign-up, and general sign-up dates are required.";
  }

  const oneShotDate = zonedToUtc(oneShot);
  const prioritySignupAt = zonedToUtc(priority);
  const generalSignupAt = zonedToUtc(general);
  const postAt = post ? zonedToUtc(post) : new Date();

  if (
    ![oneShotDate, prioritySignupAt, generalSignupAt, postAt].every(
      (d) => Number.isFinite(d.getTime())
    ) ||
    prioritySignupAt >= generalSignupAt ||
    generalSignupAt >= oneShotDate
  ) {
    return "Check the dates. Priority sign-up must open before general sign-up, which must open before the quest.";
  }

  const result = await db.quest.updateMany({
    where: { id: questId, status: "postponed" },
    data: {
      status: "active",
      manualLock: false,
      oneShotDate,
      prioritySignupAt,
      generalSignupAt,
      postAt,
    },
  });

  if (!result.count) return "Quest not found or is not deferred.";
  return done("Quest reactivated with the new dates.");
}

export async function cancelQuest(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");

  const msg = await db.$transaction(async (tx) => {
    const q = await tx.quest.findUnique({
      where: { id: questId },
      select: { id: true, status: true },
    });

    if (!q) return "Quest not found.";

    if (q.status === "completed") {
      return "Completed quests cannot be deleted.";
    }

    const payouts = await tx.ledger.count({
      where: { questId },
    });

    if (payouts > 0) {
      return "This quest has Renown ledger records and cannot be deleted without affecting history.";
    }

    await tx.signup.deleteMany({
      where: { questId },
    });

    await tx.quest.delete({
      where: { id: questId },
    });

    return "Quest permanently deleted.";
  });

  return done(msg);
}

export async function updateQuest(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");
  const title = s(fd, "title");
  const oneShot = s(fd, "oneShot");
  const priority = s(fd, "priority");
  const general = s(fd, "general");
  const post = s(fd, "post");

  const level = Number(s(fd, "level"));
  const renownReward = Number(s(fd, "renown"));
  const minPlayers = Number(s(fd, "min"));
  const maxPlayers = Number(s(fd, "max"));

  if (!title || !oneShot || !priority || !general || !post) {
    return "Title and all dates are required.";
  }

  if (
    !Number.isInteger(level) || level < 1 ||
    !Number.isInteger(renownReward) || renownReward < 0 ||
    !Number.isInteger(minPlayers) || minPlayers < 1 ||
    !Number.isInteger(maxPlayers) || maxPlayers < minPlayers
  ) {
    return "Check the level, reward, and player limits.";
  }

  const oneShotDate = zonedToUtc(oneShot);
  const prioritySignupAt = zonedToUtc(priority);
  const generalSignupAt = zonedToUtc(general);
  const postAt = zonedToUtc(post);

  if (
    ![oneShotDate, prioritySignupAt, generalSignupAt, postAt].every(
      (d) => Number.isFinite(d.getTime())
    ) ||
    prioritySignupAt >= generalSignupAt ||
    generalSignupAt >= oneShotDate
  ) {
    return "Check the dates. Priority sign-up must open before general sign-up, which must open before the quest.";
  }

  const result = await db.quest.updateMany({
    where: {
      id: questId,
      status: { in: ["active", "postponed"] },
    },
    data: {
      title,
      description: s(fd, "description"),
      level,
      renownReward,
      minPlayers,
      maxPlayers,
      oneShotDate,
      prioritySignupAt,
      generalSignupAt,
      postAt,
    },
  });

  if (!result.count) return "Quest not found or cannot be edited.";
  return done("Quest updated.");
}

export async function unpostpone(fd: FormData): R {
  await requireAdmin();
  const d = s(fd, "oneShot");
  await db.quest.updateMany({ where: { id: s(fd, "questId"), status: "postponed" }, data: { status: "active", ...(d ? { oneShotDate: zonedToUtc(d) } : {}) } });
  return done("Quest reactivated. If it's still under the minimum, tomorrow's check may postpone it again; set a later date.");
}
export async function addToQuest(fd: FormData): R {
  await requireAdmin(); // admin override: ignores the player cap
  const questId = s(fd, "questId"), userId = s(fd, "userId"), className = CLASSES.includes(s(fd, "className")) ? s(fd, "className") : "Undecided";
  await db.signup.upsert({ where: { questId_userId: { questId, userId } }, update: { status: "signed_up", className }, create: { questId, userId, className } });
  return done("Player added.");
}
export async function removeFromQuest(fd: FormData): R {
  await requireAdmin();
  await db.signup.updateMany({ where: { id: s(fd, "signupId"), status: "signed_up" }, data: { status: "withdrawn" } });
  return done("Player removed from quest.");
}

export async function completeQuest(fd: FormData): R {
  await requireAdmin();
  const questId = s(fd, "questId");
  const noShow = new Set(fd.getAll("noshow").map(String));
  const msg = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Quest" WHERE id = ${questId} FOR UPDATE`; // blocks double-submit
    const q = await tx.quest.findUnique({ where: { id: questId }, include: { signups: { where: { status: "signed_up" } } } });
    if (!q || q.status !== "active") return "This quest can't be completed (already completed, cancelled or postponed).";
    for (const su of q.signups) {
      if (noShow.has(su.userId)) { await tx.signup.update({ where: { id: su.id }, data: { status: "no_show" } }); continue; }
      const first = (await tx.signup.count({ where: { userId: su.userId, status: "completed" } })) === 0;
      const bonus = Math.max(0, parseInt(s(fd, `bonus_${su.userId}`), 10) || 0);
      const rows = [
        { amount: q.renownReward, reason: "quest" },
        { amount: bonus, reason: "bonus" },
        { amount: first ? FIRST_QUEST_BONUS : 0, reason: "first_quest" },
      ].filter((r) => r.amount > 0);
      for (const r of rows) await tx.ledger.create({ data: { userId: su.userId, questId, ...r } });
      const total = rows.reduce((t, r) => t + r.amount, 0);
      if (total) await tx.user.update({ where: { id: su.userId }, data: { renown: { increment: total } } });
      await tx.signup.update({ where: { id: su.id }, data: { status: "completed" } });
    }
    await tx.quest.update({ where: { id: questId }, data: { status: "completed" } });
    return "Quest completed and renown paid out.";
  });
  return done(msg);
}
