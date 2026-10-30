"use server";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  COOKIE,
  requireAdmin,
  requireUser,
  startSession,
} from "@/lib/auth";
import {
  CLASSES,
  DAY,
  ITEM_TYPES,
  PRIORITY_WINDOW_DAYS,
  TZ,
  doorState,
  fmt,
  priorityUnlocked,
  zonedToUtc,
} from "@/lib/util";


type R = Promise<string | void>;

const s = (fd: FormData, k: string) =>
  String(fd.get(k) ?? "").trim();

const done = (msg: string) => {
  revalidatePath("/", "layout");
  return msg;
};

const hasPriority = (u: {
  hasPriority: boolean;
  priorityUntil: Date | null;
}) =>
  u.hasPriority ||
  (!!u.priorityUntil && u.priorityUntil > new Date());

/* ---------- auth ---------- */

const attempts = new Map<string, { n: number; t: number }>();

export async function login(fd: FormData): R {
  const username = s(fd, "username").toLowerCase();
  const now = Date.now();
  const a = attempts.get(username);
  const live =
    a && now - a.t < 15 * 60000 ? a : undefined;

  if (live && live.n >= 10) {
    return "Too many attempts. Try again in 15 minutes.";
  }

  const u = await db.user.findUnique({
    where: { username },
  });

  if (
    !u ||
    !u.isActive ||
    !(await bcrypt.compare(
      String(fd.get("password") ?? ""),
      u.passwordHash
    ))
  ) {
    attempts.set(username, {
      n: (live?.n ?? 0) + 1,
      t: live?.t ?? now,
    });

    return "Wrong username or password.";
  }

  attempts.delete(username);
  await startSession(u.id);
  redirect("/");
}

export async function logout() {
  await (await cookies()).delete(COOKIE);
  redirect("/login");
}

export async function deletePlayer(fd: FormData): R {
  await requireAdmin();

  const userId = s(fd, "userId");

  if (!userId) {
    return "Missing player ID.";
  }

  return done(
    await db.$transaction(async (tx) => {
      const player = await tx.user.findFirst({
        where: {
          id: userId,
          role: "player",
        },
        select: {
          id: true,
          username: true,
        },
      });

      if (!player) return "Player not found.";

      await tx.signup.deleteMany({
        where: { userId: player.id },
      });

      await tx.ledger.deleteMany({
        where: { userId: player.id },
      });

      await tx.priorityKey.updateMany({
        where: { redeemedById: player.id },
        data: {
          redeemedById: null,
          redeemedAt: null,
        },
      });

      await tx.user.delete({
        where: { id: player.id },
      });

      return `Player "${player.username}" permanently deleted.`;
    })
  );
}

/* ---------- player ---------- */

export async function signUp(fd: FormData): R {
  const u = await requireUser();
  const questId = s(fd, "questId");
  const cls = s(fd, "className");

  if (!CLASSES.includes(cls)) {
    return "Pick a class.";
  }

  const msg = await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "Quest"
      WHERE id = ${questId}
      FOR UPDATE
    `;

    const q = await tx.quest.findUnique({
      where: { id: questId },
    });

    if (!q || q.status !== "active") {
      return "Quest not found or sign-ups are unavailable.";
    }

    const existing = await tx.signup.findUnique({
      where: {
        questId_userId: {
          questId,
          userId: u.id,
        },
      },
    });

    if (existing?.status === "signed_up") {
      await tx.signup.update({
        where: { id: existing.id },
        data: { className: cls },
      });

      return "Class updated.";
    }

    const count = await tx.signup.count({
      where: {
        questId,
        status: "signed_up",
      },
    });

    const priority = hasPriority(u);
    const st = doorState(q, count, priority);

    const unlocked = priorityUnlocked(
      q,
      st,
      count,
      priority
    );

    if (
      q.postAt > new Date() ||
      (st !== "open" &&
        st !== "priority" &&
        !unlocked)
    ) {
      return "Sign-ups aren't open to you for this quest.";
    }

    if (existing) {
      await tx.signup.update({
        where: { id: existing.id },
        data: {
          status: "signed_up",
          className: cls,
        },
      });
    } else {
      await tx.signup.create({
        data: {
          questId,
          userId: u.id,
          className: cls,
        },
      });
    }

    return "You're signed up.";
  });

  return done(msg);
}

export async function withdraw(fd: FormData): R {
  const u = await requireUser();

  await db.signup.updateMany({
    where: {
      questId: s(fd, "questId"),
      userId: u.id,
      status: "signed_up",
    },
    data: { status: "withdrawn" },
  });

  return done("You've withdrawn from this quest.");
}

export async function markItemUsed(fd: FormData): R {
  const u = await requireUser();

  const r = await db.ownedItem.updateMany({
    where: {
      id: s(fd, "ownedId"),
      userId: u.id,
      type: "consumable",
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });

  if (!r.count) {
    return "That item can't be marked as used.";
  }

  return done("Marked as used.");
}

export async function redeemKey(fd: FormData): R {
  const u = await requireUser();

  const key = await db.priorityKey.findUnique({
    where: {
      code: s(fd, "code").toLowerCase(),
    },
  });

  if (!key) return "That key doesn't exist.";

  if (key.expiresAt <= new Date()) {
    return "That key has expired.";
  }

  const until =
    u.priorityUntil && u.priorityUntil > key.expiresAt
      ? u.priorityUntil
      : key.expiresAt;

  await db.user.update({
    where: { id: u.id },
    data: { priorityUntil: until },
  });

  return done(
    `Priority access unlocked until ${fmt(until)}.`
  );
}

/* ---------- admin: players, renown, keys ---------- */

const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;

export async function resetPlayer(fd: FormData): R {
  await requireAdmin();

  const userId = s(fd, "userId");

  if (!userId) {
    return "Missing player ID.";
  }

  const msg = await db.$transaction(async (tx) => {
    const player = await tx.user.findFirst({
      where: {
        id: userId,
        role: "player",
      },
      select: {
        id: true,
        username: true,
      },
    });

    if (!player) {
      return "Player not found.";
    }

    // Remove all of the player's inventory items.
    await tx.ownedItem.deleteMany({
      where: { userId: player.id },
    });

    // Remove all quest sign-ups, including historical sign-ups.
    await tx.signup.deleteMany({
      where: { userId: player.id },
    });

    // Remove all achievements earned by this player. Achievement definitions remain.
    await tx.userAchievement.deleteMany({
      where: { userId: player.id },
    });

    // Remove all Renown transaction history.
    await tx.ledger.deleteMany({
      where: { userId: player.id },
    });

    // Reset the player's Renown balance.
    await tx.user.update({
      where: { id: player.id },
      data: { renown: 0 },
    });

    return `Player "${player.username}" has been reset.`;
  });

  return done(msg);
}

export async function createPlayer(fd: FormData): R {
  await requireAdmin();

  const displayName = s(fd, "displayName");
  const username = s(fd, "username").toLowerCase();
  const pw = String(fd.get("password") ?? "");
  const priority = fd.get("priority") === "on";

  if (!displayName) return "Enter a display name.";

  if (!USERNAME_RE.test(username)) {
    return "Username must be 3-24 characters: letters, numbers, dot, dash or underscore.";
  }

  if (
    await db.user.findUnique({
      where: { username },
    })
  ) {
    return "That username is already taken.";
  }

  await db.user.create({
    data: {
      username,
      displayName,
      passwordHash: await bcrypt.hash(pw, 12),
      hasPriority: priority,
    },
  });

  return done(
    `Created ${username}. Share the username and password you chose with the player.`
  );
}

export async function resetPassword(fd: FormData): R {
  await requireAdmin();

  const pw = String(fd.get("password") ?? "");

  await db.user.update({
    where: { id: s(fd, "userId") },
    data: {
      passwordHash: await bcrypt.hash(pw, 12),
    },
  });

  return "Password updated. Share the new password with the player.";
}


export async function updatePlayerDetails(fd: FormData): R {
  await requireAdmin();

  const userId = s(fd, "userId");
  const displayName = s(fd, "displayName");
  const username = s(fd, "username").toLowerCase();

  if (!userId) return "Missing player ID.";

  if (!displayName || displayName.length > 60) {
    return "Display name must contain 1-60 characters.";
  }

  if (!USERNAME_RE.test(username)) {
    return "Username must be 3-24 characters: letters, numbers, dot, dash or underscore.";
  }

  const player = await db.user.findFirst({
    where: {
      id: userId,
      role: "player",
    },
    select: {
      id: true,
    },
  });

  if (!player) return "Player not found.";

  const duplicate = await db.user.findFirst({
    where: {
      username,
      id: { not: userId },
    },
    select: { id: true },
  });

  if (duplicate) {
    return "That username is already taken.";
  }

  try {
    const result = await db.user.updateMany({
      where: {
        id: userId,
        role: "player",
      },
      data: {
        displayName,
        username,
      },
    });

    if (!result.count) return "Player not found.";

  } catch {
    return "That username is already taken.";
  }

  return done("Player information updated.");
}


export async function removePlayerAchievement(fd: FormData): R {
  await requireAdmin();

  const userId = s(fd, "userId");
  const userAchievementId = s(fd, "userAchievementId");

  if (!userId || !userAchievementId) {
    return "Missing player or achievement ID.";
  }

  const result = await db.$transaction(async (tx) => {

    // Lock the player's balance against concurrent Renown changes.
    await tx.$queryRaw`
      SELECT id FROM "User"
      WHERE id = ${userId}
      FOR UPDATE
    `;

    const player = await tx.user.findFirst({
      where: {
        id: userId,
        role: "player",
      },
      select: {
        id: true,
        renown: true,
      },
    });

    if (!player) return "Player not found.";

    const earned = await tx.userAchievement.findFirst({
      where: {
        id: userAchievementId,
        userId: player.id,
      },
      include: {
        achievement: true,
      },
    });

    if (!earned) {
      return "This achievement is no longer assigned to the player.";
    }

    const reward = earned.achievement.reward;

    if (player.renown < reward) {
      return `Cannot remove this achievement. The player has ${player.renown} Renown but needs ${reward} to reverse the achievement reward.`;
    }

    // Remove the earned achievement.
    await tx.userAchievement.delete({
      where: {
        id: earned.id,
      },
    });

    // Reverse the original achievement payout.
    if (reward > 0) {
      await tx.user.update({
        where: {
          id: player.id,
        },
        data: {
          renown: {
            decrement: reward,
          },
        },
      });

      // Preserve the Renown transaction history.
      await tx.ledger.create({
        data: {
          userId: player.id,
          amount: -reward,
          reason: "achievement",
          note: `Removed achievement: ${earned.achievement.name}`,
        },
      });
    }

    return `Removed "${earned.achievement.name}" and deducted ${reward} Renown.`;
  });

  return done(result);
}



export async function setPriority(fd: FormData) {
  await requireAdmin();

  const userId = s(fd, "userId");
  const value = s(fd, "value") === "1";

  await db.user.update({
    where: { id: userId },
    data: value
      ? {
          hasPriority: true,
        }
      : {
          hasPriority: false,
          priorityUntil: null,
        },
  });

  revalidatePath("/admin");
}


export async function deactivate(fd: FormData): R {
  await requireAdmin();

  await db.user.updateMany({
    where: {
      id: s(fd, "userId"),
      role: "player",
    },
    data: { isActive: false },
  });

  return done("Player removed.");
}

export async function adjustRenown(fd: FormData): R {
  await requireAdmin();

  const userId = s(fd, "userId");
  const amount = parseInt(s(fd, "amount"), 10);

  if (!amount) return "Enter a non-zero amount.";

  return done(
    await db.$transaction(async (tx) => {
      const u = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!u || u.renown + amount < 0) {
        return "Balance can't go below zero.";
      }

      await tx.ledger.create({
        data: {
          userId,
          amount,
          reason: "admin_adjust",
          note: s(fd, "note") || null,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          renown: { increment: amount },
        },
      });

      return `Renown ${amount > 0 ? "added" : "deducted"}.`;
    })
  );
}

export async function createKey(fd: FormData): R {
  await requireAdmin();

  const keyCode = s(fd, "code").toLowerCase();
  const days = parseInt(s(fd, "days"), 10) || 5;

  if (!/^[a-z0-9-]{4,32}$/.test(keyCode)) {
    return "Key must be 4-32 characters: letters, numbers or dashes.";
  }

  if (
    await db.priorityKey.findUnique({
      where: { code: keyCode },
    })
  ) {
    return "A key with that code already exists.";
  }

  const k = await db.priorityKey.create({
    data: {
      code: keyCode,
      expiresAt: new Date(Date.now() + days * DAY),
    },
  });

  return done(
    `Key "${k.code}" created, valid until ${fmt(k.expiresAt)}.`
  );
}

export async function extendKey(fd: FormData): R {
  await requireAdmin();

  const days = Number(s(fd, "days"));

  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365
  ) {
    return "Enter a whole number of days from 1 to 365.";
  }

  const key = await db.priorityKey.findUnique({
    where: { id: s(fd, "keyId") },
  });

  const now = new Date();

  if (!key || key.expiresAt <= now) {
    return "That key has expired or no longer exists.";
  }

  const expiresAt = new Date(
    key.expiresAt.getTime() + days * DAY
  );

  const result = await db.priorityKey.updateMany({
    where: {
      id: key.id,
      expiresAt: key.expiresAt,
    },
    data: { expiresAt },
  });

  if (!result.count) {
    return "That key changed. Refresh and try again.";
  }

  return done(
    `Key "${key.code}" extended to ${fmt(expiresAt)}.`
  );
}

export async function deleteKey(fd: FormData): R {
  await requireAdmin();

  const result = await db.priorityKey.deleteMany({
    where: { id: s(fd, "keyId") },
  });

  if (!result.count) return "Key not found.";

  return done("Key deleted.");
}

/* ---------- admin: quests ---------- */

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

  if (!result.count) {
    return "Quest not found or is not active.";
  }

  return done(
    locking
      ? "Quest locked."
      : "Quest unlocked. General sign-ups are open now."
  );
}

export async function rescheduleQuest(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");
  const rawDate = s(fd, "oneShot");

  if (!rawDate) {
    return "Choose a new one-shot date.";
  }

  const oneShotDate = zonedToUtc(rawDate);

  if (!Number.isFinite(oneShotDate.getTime())) {
    return "Invalid one-shot date.";
  }

  const result = await db.quest.updateMany({
    where: {
      id: questId,
      status: { in: ["active", "postponed"] },
    },
    data: { oneShotDate },
  });

  if (!result.count) {
    return "Quest not found or cannot be rescheduled.";
  }

  return done("One-shot date updated.");
}

export async function createQuest(fd: FormData): R {
  await requireAdmin();

  const n = (k: string, d: number) => {
    const raw = s(fd, k);
    return raw === "" ? d : Number(raw);
  };

  const title = s(fd, "title");
  const oneShot = s(fd, "oneShot");
  const general = s(fd, "general");
  const intent = s(fd, "intent");

  if (!title || !oneShot || !general) {
    return "Title, general sign-up date, and one-shot date are required.";
  }

  if (intent !== "draft" && intent !== "postNow") {
    return "Choose Save Draft or Post Now.";
  }

  const now = new Date();
  const oneShotDate = zonedToUtc(oneShot);
  const generalSignupAt = zonedToUtc(general);

  const prioritySignupAt = now;
  const postAt = now;
  const status = intent === "draft" ? "draft" : "active";

  const minPlayers = n("min", 3);
  const maxPlayers = n("max", 6);
  const level = n("level", 1);
  const renownReward = n("renown", 0);

  if (
    ![
      oneShotDate,
      generalSignupAt,
      prioritySignupAt,
      postAt,
    ].every((d) => Number.isFinite(d.getTime())) ||
    generalSignupAt <= now ||
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
      status,
    },
  });

  return done(
    intent === "draft"
      ? `Draft "${q.title}" saved. It has not been published.`
      : `"${q.title}" posted! Priority sign-ups are now open. General sign-ups open ${fmt(generalSignupAt)}.`
  );
}

export async function postNow(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");
  const now = new Date();

  const result = await db.quest.updateMany({
    where: {
      id: questId,
      status: { in: ["draft", "active", "postponed"] },
    },
    data: {
      status: "active",
      postAt: now,
      prioritySignupAt: now,
      manualLock: false,
    },
  });

  if (!result.count) {
    return "Quest not found or cannot be posted.";
  }

  return done(
    "Quest posted! Priority sign-ups are now open. The general sign-up date has been preserved."
  );
}

export async function deferQuest(fd: FormData): R {
  await requireAdmin();

  const result = await db.quest.updateMany({
    where: {
      id: s(fd, "questId"),
      status: "active",
    },
    data: {
      status: "postponed",
      manualLock: true,
    },
  });

  if (!result.count) {
    return "Only active quests can be deferred.";
  }

  return done(
    "Quest deferred. It is hidden from players until reactivated."
  );
}

/*
 * Reactivate a postponed quest without requiring Post At or
 * Priority Sign-Up form fields. Those timestamps are preserved.
 *
 * The One-Shot Date and General Sign-Up date are optional:
 * if either is omitted, its currently saved value is retained.
 */
export async function reactivateQuest(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");
  const oneShot = s(fd, "oneShot");
  const general = s(fd, "general");

  const existing = await db.quest.findFirst({
    where: {
      id: questId,
      status: "postponed",
    },
  });

  if (!existing) {
    return "Quest not found or is not deferred.";
  }

  const oneShotDate = oneShot
    ? zonedToUtc(oneShot)
    : existing.oneShotDate;

  const generalSignupAt = general
    ? zonedToUtc(general)
    : existing.generalSignupAt;

  if (
    !Number.isFinite(oneShotDate.getTime()) ||
    !Number.isFinite(generalSignupAt.getTime()) ||
    generalSignupAt >= oneShotDate
  ) {
    return "The general sign-up date must be before the one-shot date.";
  }

  const result = await db.quest.updateMany({
    where: {
      id: questId,
      status: "postponed",
    },
    data: {
      status: "active",
      manualLock: false,
      oneShotDate,
      generalSignupAt,
    },
  });

  if (!result.count) {
    return "Quest status changed. Refresh and try again.";
  }

  return done(
    "Quest reactivated. Existing posting and priority timestamps were preserved."
  );
}

export async function deletePastQuest(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");

  const msg = await db.$transaction(async (tx) => {
    const q = await tx.quest.findUnique({
      where: { id: questId },
    });

    if (
      !q ||
      !["completed", "cancelled"].includes(q.status)
    ) {
      return "Only completed or cancelled quests can be permanently deleted.";
    }

    await tx.signup.deleteMany({
      where: { questId },
    });

    await tx.quest.delete({
      where: { id: questId },
    });

    return `Deleted "${q.title}" permanently.`;
  });

  return done(msg);
}

export async function cancelQuest(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");

  const msg = await db.$transaction(async (tx) => {
    const q = await tx.quest.findUnique({
      where: { id: questId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!q) return "Quest not found.";

    if (q.status === "completed") {
      return "Completed quests cannot be deleted.";
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

/*
 * Updated Quest Details form:
 * - Requires only General Sign-Up and One-Shot dates.
 * - Does not change postAt.
 * - Does not change prioritySignupAt.
 * - Preserves the current status, including draft status.
 */

export async function updateQuest(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");
  const title = s(fd, "title");
  const general = s(fd, "general");
  const oneShot = s(fd, "oneShot");

  const n = (k: string) => {
    const raw = s(fd, k);
    return raw === "" ? NaN : Number(raw);
  };

  if (!questId || !title || !general || !oneShot) {
    return "Title, general sign-up date, and one-shot date are required.";
  }

  const generalSignupAt = zonedToUtc(general);
  const oneShotDate = zonedToUtc(oneShot);

  const level = n("level");
  const renownReward = n("renown");
  const minPlayers = n("min");
  const maxPlayers = n("max");

  if (
    !Number.isFinite(generalSignupAt.getTime()) ||
    !Number.isFinite(oneShotDate.getTime()) ||
    generalSignupAt >= oneShotDate ||
    !Number.isInteger(level) ||
    level < 1 ||
    !Number.isInteger(renownReward) ||
    renownReward < 0 ||
    !Number.isInteger(minPlayers) ||
    minPlayers < 1 ||
    !Number.isInteger(maxPlayers) ||
    maxPlayers < minPlayers
  ) {
    return "Check the dates, player limits, level, and Renown reward.";
  }

  const result = await db.quest.updateMany({
    where: {
      id: questId,
      status: { in: ["draft", "active", "postponed"] },
    },
    data: {
      title,
      description: s(fd, "description"),
      level,
      renownReward,
      minPlayers,
      maxPlayers,
      generalSignupAt,
      oneShotDate,
    },
  });

  if (!result.count) {
    return "Quest not found or cannot be edited.";
  }

  return done("Quest updated. Posting and priority access dates were left unchanged.");
}


export async function unpostpone(fd: FormData): R {
  await requireAdmin();

  const d = s(fd, "oneShot");

  await db.quest.updateMany({
    where: {
      id: s(fd, "questId"),
      status: "postponed",
    },
    data: {
      status: "active",
      ...(d ? { oneShotDate: zonedToUtc(d) } : {}),
    },
  });

  return done(
    "Quest reactivated. If it's still under the minimum, tomorrow's check may postpone it again; set a later date."
  );
}

export async function addToQuest(fd: FormData): R {
  await requireAdmin();

  // Admin override: ignores the player cap.
  const questId = s(fd, "questId");
  const userId = s(fd, "userId");
  const className = CLASSES.includes(s(fd, "className"))
    ? s(fd, "className")
    : "Undecided";

  await db.signup.upsert({
    where: {
      questId_userId: {
        questId,
        userId,
      },
    },
    update: {
      status: "signed_up",
      className,
    },
    create: {
      questId,
      userId,
      className,
    },
  });

  return done("Player added.");
}

export async function removeFromQuest(fd: FormData): R {
  await requireAdmin();

  await db.signup.updateMany({
    where: {
      id: s(fd, "signupId"),
      status: "signed_up",
    },
    data: { status: "withdrawn" },
  });

  return done("Player removed from quest.");
}

export async function updateSignupClass(fd: FormData): R {
  const currentUser = await requireUser();

  const questId = s(fd, "questId");
  const userId = s(fd, "userId");
  const className = s(fd, "className");

  if (!questId || !userId) {
    return "Missing quest or player ID.";
  }

  if (!CLASSES.includes(className)) {
    return "Pick a valid class.";
  }

  // Players may only change their own class.
  // Admins may change any signed-up player's class.
  if (
    currentUser.role !== "admin" &&
    currentUser.id !== userId
  ) {
    return "You aren't allowed to change this player's class.";
  }

  const result = await db.signup.updateMany({
    where: {
      questId,
      userId,
      status: "signed_up",
    },
    data: {
      className,
    },
  });

  if (!result.count) {
    return "Active signup not found. Refresh the page and try again.";
  }

  return done("Player class updated.");
}

type AchievementTx = Prisma.TransactionClient;

/** Creates an achievement award and its Renown payout exactly once. */
async function grantAchievement(
  tx: AchievementTx,
  achievement: { id: string; name: string; reward: number },
  userId: string,
  source: "automatic" | "manual"
) {
  const created = await tx.userAchievement.createMany({
    data: { userId, achievementId: achievement.id, source },
    skipDuplicates: true,
  });

  if (created.count === 0) return false;

  if (achievement.reward > 0) {
    await tx.ledger.create({
      data: {
        userId,
        amount: achievement.reward,
        reason: "achievement",
        note: `Achievement: ${achievement.name}`,
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { renown: { increment: achievement.reward } },
    });
  }
  return true;
}

/** Checks event-based automatic achievements inside the triggering transaction. */
async function checkAutomaticAchievements(
  tx: AchievementTx,
  event: "quest_completed" | "store_purchase",
  userIds: string[],
  partySize = 0
) {
  if (userIds.length === 0) return;

  const achievements = await tx.achievement.findMany({
    where: {
      assignType: "Automatic",
      isActive: true,
    },
  });

  for (const achievement of achievements) {
    // Complete X quests.
    if (
      event === "quest_completed" &&
      achievement.trigger === "completed_quests"
    ) {
      if (achievement.earnType !== "Individual") continue;

      for (const userId of userIds) {
        const completedCount = await tx.signup.count({
          where: {
            userId,
            status: "completed",
          },
        });

        if (completedCount >= Math.max(1, achievement.target)) {
          await grantAchievement(
            tx,
            achievement,
            userId,
            "automatic"
          );
        }
      }
    }

    // Complete a quest with X or more players.
    if (
      event === "quest_completed" &&
      achievement.trigger === "completed_quest_party_size"
    ) {
      if (achievement.earnType !== "Team") continue;

      if (partySize >= Math.max(1, achievement.target)) {
        for (const userId of userIds) {
          await grantAchievement(
            tx,
            achievement,
            userId,
            "automatic"
          );
        }
      }
    }

    // Spend X Renown in the store.
    if (
      event === "store_purchase" &&
      achievement.trigger === "renown_spent"
    ) {
      if (achievement.earnType !== "Individual") continue;

      for (const userId of userIds) {
        const spent = await tx.ledger.aggregate({
          where: {
            userId,
            reason: "store_purchase",
            amount: { lt: 0 },
          },
          _sum: {
            amount: true,
          },
        });

        if (
          Math.abs(spent._sum.amount ?? 0) >=
          Math.max(1, achievement.target)
        ) {
          await grantAchievement(
            tx,
            achievement,
            userId,
            "automatic"
          );
        }
      }
    }

    // Buy X items.
    if (
      event === "store_purchase" &&
      achievement.trigger === "items_purchased"
    ) {
      if (achievement.earnType !== "Individual") continue;

      for (const userId of userIds) {
        const purchasedCount = await tx.ownedItem.count({
          where: {
            userId,
          },
        });

        if (
          purchasedCount >= Math.max(1, achievement.target)
        ) {
          await grantAchievement(
            tx,
            achievement,
            userId,
            "automatic"
          );
        }
      }
    }
  }
}

export async function completeQuest(fd: FormData): R {
  await requireAdmin();

  const questId = s(fd, "questId");

  const msg = await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "Quest"
      WHERE id = ${questId}
      FOR UPDATE
    `;

    const q = await tx.quest.findUnique({
      where: { id: questId },
      include: {
        signups: {
          where: { status: "signed_up" },
        },
      },
    });

    if (!q || q.status !== "active") {
      return "This quest can't be completed (already completed, cancelled or postponed).";
    }

    for (const su of q.signups) {
      const bonus = Math.max(
        0,
        parseInt(s(fd, `bonus_${su.userId}`), 10) || 0
      );

      const rows = [
        {
          amount: q.renownReward,
          reason: "quest",
        },
        {
          amount: bonus,
          reason: "bonus",
        },
      ].filter((r) => r.amount > 0);

      for (const r of rows) {
        await tx.ledger.create({
          data: {
            userId: su.userId,
            amount: r.amount,
            reason: r.reason,
          },
        });
      }

      const total = rows.reduce(
        (t, r) => t + r.amount,
        0
      );

      if (total > 0) {
        await tx.user.update({
          where: { id: su.userId },
          data: {
            renown: { increment: total },
          },
        });
      }

      await tx.signup.update({
        where: { id: su.id },
        data: { status: "completed" },
      });
    }

    await tx.quest.update({
      where: { id: questId },
      data: { status: "completed" },
    });

    const partyUserIds = q.signups.map((su) => su.userId);
    await checkAutomaticAchievements(
      tx,
      "quest_completed",
      partyUserIds,
      partyUserIds.length
    );

    return "Quest completed and renown paid out.";
  });

  return done(msg);
}
/* ---------- admin: store ---------- */

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Accepts "example.com" or "https://example.com/page".
// Only http(s) is allowed.
function cleanUrl(raw: string): string | null {
  const t = raw.trim();

  if (!t) return null;

  try {
    const u = new URL(
      /^[a-z][a-z0-9+.-]*:/i.test(t)
        ? t
        : `https://${t}`
    );

    return u.protocol === "http:" ||
      u.protocol === "https:"
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}

// Identify the image from its bytes, not the browser's file type.
function sniffImage(b: Buffer): string | null {
  if (
    b.length > 12 &&
    b
      .subarray(0, 8)
      .equals(
        Buffer.from([
          0x89, 0x50, 0x4e, 0x47,
          0x0d, 0x0a, 0x1a, 0x0a,
        ])
      )
  ) {
    return "image/png";
  }

  if (
    b.length > 3 &&
    b[0] === 0xff &&
    b[1] === 0xd8 &&
    b[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    b.length > 12 &&
    b.subarray(0, 4).toString("ascii") === "RIFF" &&
    b.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (
    b.length > 6 &&
    ["GIF87a", "GIF89a"].includes(
      b.subarray(0, 6).toString("ascii")
    )
  ) {
    return "image/gif";
  }

  return null;
}

// null = no file chosen; string = error; object = valid image.
async function readImage(
  fd: FormData
): Promise<
  null | string | { mime: string; data: Buffer }
> {
  const f = fd.get("image");

  if (!(f instanceof File) || f.size === 0) {
    return null;
  }

  if (f.size > MAX_IMAGE_BYTES) {
    return "The image must be 5 MB or smaller.";
  }

  const data = Buffer.from(await f.arrayBuffer());
  const mime = sniffImage(data);

  if (!mime) {
    return "The image must be a PNG, JPEG, WebP or GIF.";
  }

  return { mime, data };
}

function parseItem(fd: FormData) {
  const name = s(fd, "name");
  const rawPrice = s(fd, "price");
  const price = Number(rawPrice);
  const type = s(fd, "type");
  const labelId = s(fd, "labelId");

  if (!name) return "Enter an Item Name.";

  if (name.length > 100) {
    return "Item name must be 100 characters or fewer.";
  }

  if (
    rawPrice === "" ||
    !Number.isInteger(price) ||
    price < 0
  ) {
    return "Price must be a whole number of Renown, 0 or more.";
  }

  if (!(ITEM_TYPES as readonly string[]).includes(type)) {
    return "Pick an Item Type.";
  }

  if (!labelId) {
    return "Choose a Label for this item.";
  }

  return {
    name,
    price,
    type,
    labelId,
    description: s(fd, "description"),
    statSheet: s(fd, "statSheet"),
  };
}


export async function buyItem(fd: FormData): R {
  const u = await requireUser();
  const itemId = s(fd, "itemId");

  if (!itemId) {
    return "Missing Item ID.";
  }

  if (u.role !== "player") {
    return "Only players can purchase store items.";
  }

  const msg = await db.$transaction(async (tx) => {
    // Lock the player's row to prevent concurrent purchases
    // from spending the same Renown balance.
    await tx.$queryRaw`
      SELECT id FROM "User"
      WHERE id = ${u.id}
      FOR UPDATE
    `;

    const player = await tx.user.findUnique({
      where: { id: u.id },
      select: {
        id: true,
        renown: true,
        isActive: true,
      },
    });

    if (!player || !player.isActive) {
      return "Your account is not active.";
    }

    const item = await tx.shopItem.findUnique({
      where: { id: itemId },
    });

    if (!item || !item.isActive) {
      return "This item is no longer available.";
    }

    if (player.renown < item.price) {
      return `You don't have enough Renown to buy "${item.name}".`;
    }

    // Deduct Renown and record the transaction.
    if (item.price > 0) {
      await tx.user.update({
        where: { id: player.id },
        data: {
          renown: { decrement: item.price },
        },
      });

      await tx.ledger.create({
        data: {
          userId: player.id,
          amount: -item.price,
          reason: "store_purchase",
          note: `Purchased "${item.name}"`,
        },
      });
    }

    // Store a snapshot of the item in the player's inventory.
    await tx.ownedItem.create({
      data: {
        userId: player.id,
        name: item.name,
        type: item.type,
      },
    });

        // Check purchase achievements after successfully adding the item.
    // This also counts items that cost 0 Renown.
    await checkAutomaticAchievements(
      tx,
      "store_purchase",
      [player.id]
    );

    return `You bought "${item.name}" for ${item.price} Renown.`;
  });

  return done(msg);
}

export async function createItem(fd: FormData): R {
  await requireAdmin();

  const data = parseItem(fd);

  if (typeof data === "string") return data;

  if (
    !(await db.itemLabel.findUnique({
      where: { id: data.labelId },
      select: { id: true },
    }))
  ) {
    return "Choose a label for this item.";
  }

  const img = await readImage(fd);

  if (typeof img === "string") return img;

  const rawLink = s(fd, "linkUrl");
  const link = rawLink ? cleanUrl(rawLink) : null;

  if (rawLink && !link) {
    return "The source link must be a valid web address.";
  }

  const item = await db.shopItem.create({
    data: {
      ...data,
      ...(img
        ? { image: { create: img } }
        : {}),
      ...(link
        ? {
            links: {
              create: [
                {
                  url: link,
                  label:
                    s(fd, "linkLabel") ||
                    new URL(link).hostname.replace(/^www\./, ""),
                },
              ],
            },
          }
        : {}),
    },
  });

  return done(`Created "${item.name}".`);
}

export async function updateItem(fd: FormData): R {
  await requireAdmin();

  const itemId = s(fd, "itemId");
  const data = parseItem(fd);

  if (typeof data === "string") return data;

  if (
    !(await db.itemLabel.findUnique({
      where: { id: data.labelId },
      select: { id: true },
    }))
  ) {
    return "Choose a label for this item.";
  }

  const img = await readImage(fd);

  if (typeof img === "string") return img;

  const removeImage = s(fd, "removeImage") === "on";

  const msg = await db.$transaction(async (tx) => {
    const r = await tx.shopItem.updateMany({
      where: { id: itemId },
      data,
    });

    if (!r.count) return "Item not found.";

    if (img || removeImage) {
      await tx.itemImage.deleteMany({
        where: { itemId },
      });
    }

    if (img) {
      await tx.itemImage.create({
        data: { itemId, ...img },
      });
    }

    return "Item Updated.";
  });

  return done(msg);
}

export async function setItemActive(fd: FormData): R {
  await requireAdmin();

  const active = s(fd, "value") === "1";

  const result = await db.shopItem.updateMany({
    where: { id: s(fd, "itemId") },
    data: { isActive: active },
  });

  if (!result.count) return "Item not found.";

  return done(
    active
      ? "Item restored to the store."
      : "Item archived."
  );
}

export async function deleteItem(fd: FormData): R {
  await requireAdmin();

  // TODO: once inventory exists, refuse to delete items
  // that players own; archive them instead.
  const result = await db.shopItem.deleteMany({
    where: { id: s(fd, "itemId") },
  });

  if (!result.count) return "Item not found.";

  return done("Item permanently deleted.");
}

export async function addItemLink(fd: FormData): R {
  await requireAdmin();

  const itemId = s(fd, "itemId");
  const url = cleanUrl(s(fd, "url"));

  if (!url) {
    return "Enter a valid web address (http or https).";
  }

  if (
    !(await db.shopItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    }))
  ) {
    return "Item not found.";
  }

  const label =
    s(fd, "label") ||
    new URL(url).hostname.replace(/^www\./, "");

  await db.itemLink.create({
    data: {
      itemId,
      label: label.slice(0, 60),
      url,
    },
  });

  return done("Source link added.");
}

export async function removeItemLink(fd: FormData): R {
  await requireAdmin();

  await db.itemLink.deleteMany({
    where: { id: s(fd, "linkId") },
  });

  return done("Source link removed.");
}

/* ---------- admin: store labels ---------- */

function cleanLabel(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();

  return name && name.length <= 30 ? name : null;
}

export async function createLabel(fd: FormData): R {
  await requireAdmin();

  const name = cleanLabel(s(fd, "name"));

  if (!name) {
    return "Enter a label name (up to 30 characters).";
  }

  if (
    await db.itemLabel.findFirst({
      where: {
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
    })
  ) {
    return "That label already exists.";
  }

  await db.itemLabel.create({
    data: { name },
  });

  return done(`Label "${name}" added.`);
}

export async function renameLabel(fd: FormData): R {
  await requireAdmin();

  const id = s(fd, "labelId");
  const name = cleanLabel(s(fd, "name"));

  if (!name) {
    return "Enter a label name (up to 30 characters).";
  }

  if (
    await db.itemLabel.findFirst({
      where: {
        id: { not: id },
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
    })
  ) {
    return "That label already exists.";
  }

  const result = await db.itemLabel.updateMany({
    where: { id },
    data: { name },
  });

  if (!result.count) return "Label not found.";

  return done(`Label renamed to "${name}".`);
}

export async function deleteLabel(fd: FormData): R {
  await requireAdmin();

  const id = s(fd, "labelId");

  const inUse = await db.shopItem.count({
    where: { labelId: id },
  });

  if (inUse > 0) {
    return `${inUse} item${inUse === 1 ? " uses" : "s use"} this label. Give ${
      inUse === 1 ? "it" : "them"
    } a different label first.`;
  }

  const result = await db.itemLabel.deleteMany({
    where: { id },
  });

  if (!result.count) return "Label not found.";

  return done("Label deleted.");
}

export async function reactivatePlayer(
  formData: FormData
) {
  await requireAdmin();

  const userId = String(
    formData.get("userId") ?? ""
  );

  if (!userId) {
    throw new Error("Missing player ID");
  }

  await db.user.update({
    where: { id: userId },
    data: { isActive: true },
  });

  revalidatePath("/admin");
}


/* ---------- achievements ---------- */

const ACHIEVEMENT_TRIGGERS = [
  "completed_quests",
  "renown_spent",
  "completed_quest_party_size",
  "items_purchased",
] as const;

function parseAchievementForm(fd: FormData) {
  const name = s(fd, "name");
  const assignType = s(fd, "assignType");
  const earnType = s(fd, "earnType");
  const trigger = s(fd, "trigger");
  const target = Math.max(1, parseInt(s(fd, "target"), 10) || 1);
  const reward = parseInt(s(fd, "reward"), 10);

  if (!name) {
    return "Enter an achievement name.";
  }

  if (!["Automatic", "Manual"].includes(assignType)) {
    return "Choose a valid assignment type.";
  }

  if (!["Individual", "Team"].includes(earnType)) {
    return "Choose a valid earning type.";
  }

  if (!Number.isInteger(reward) || reward < 0) {
    return "Reward must be zero or greater.";
  }

  if (
    assignType === "Automatic" &&
    !(ACHIEVEMENT_TRIGGERS as readonly string[]).includes(trigger)
  ) {
    return "Choose a valid automatic trigger.";
  }

  if (
    assignType === "Automatic" &&
    trigger === "completed_quest_party_size" &&
    earnType !== "Team"
  ) {
    return "Party-size achievements must use Team earning type.";
  }

  if (
    assignType === "Automatic" &&
    trigger !== "completed_quest_party_size" &&
    earnType !== "Individual"
  ) {
    return "This automatic trigger currently supports Individual achievements only.";
  }

  return {
    name,
    assignType,
    earnType,
    secret: fd.get("secret") === "on",
    description: s(fd, "description"),
    reward,
    trigger: assignType === "Automatic" ? trigger : null,
    target,
  };
}

export async function createAchievement(fd: FormData): R {
  await requireAdmin();
  const data = parseAchievementForm(fd);
  if (typeof data === "string") return data;
  if (await db.achievement.findUnique({ where: { name: data.name }, select: { id: true } })) {
    return "An achievement with that name already exists.";
  }
  await db.achievement.create({ data });
  return done("Achievement created.");
}

export async function updateAchievement(fd: FormData): R {
  await requireAdmin();
  const id = s(fd, "achievementId");
  if (!id) return "Missing achievement ID.";
  const data = parseAchievementForm(fd);
  if (typeof data === "string") return data;
  const duplicate = await db.achievement.findFirst({
    where: { name: data.name, NOT: { id } }, select: { id: true },
  });
  if (duplicate) return "Another achievement already uses that name.";
  await db.achievement.update({ where: { id }, data });
  return done("Achievement updated.");
}

export async function toggleAchievement(fd: FormData): R {
  await requireAdmin();
  const id = s(fd, "achievementId");
  const isActive = s(fd, "isActive") === "true";
  if (!id) return "Missing achievement ID.";
  await db.achievement.update({ where: { id }, data: { isActive } });
  return done(isActive ? "Achievement enabled." : "Achievement disabled.");
}


export async function awardAchievementManually(fd: FormData): R {
  await requireAdmin();

  const achievementId = s(fd, "achievementId");
  const userId = s(fd, "userId");
  const questId = s(fd, "questId");

  if (!achievementId) return done("Choose an achievement.");

  const result = await db.$transaction(async (tx) => {
    const achievement = await tx.achievement.findUnique({
      where: { id: achievementId },
    });

    if (!achievement || !achievement.isActive) {
      return "Achievement not found or disabled.";
    }

    let userIds: string[] = [];

    if (achievement.earnType === "Team") {
      if (!questId) {
        return "Choose a quest for this team achievement.";
      }

      const signups = await tx.signup.findMany({
        where: {
          questId,
          status: { in: ["signed_up", "completed"] },
        },
        select: { userId: true },
      });

      userIds = signups.map((x) => x.userId);

      if (userIds.length === 0) {
        return "That quest has no players to award.";
      }
    } else {
      if (!userId) {
        return "Choose a player.";
      }

      userIds = [userId];
    }

    let awarded = 0;

    for (const id of [...new Set(userIds)]) {
      if (await grantAchievement(tx, achievement, id, "manual")) {
        awarded++;
      }
    }

    return awarded === 0
      ? "Those players already have this achievement."
      : `Achievement awarded to ${awarded} player(s).`;
  });

  return done(result);
}



export async function deleteAchievement(fd: FormData): R {
  await requireAdmin();

  const achievementId = s(fd, "achievementId");

  if (!achievementId) {
    return done("Choose an achievement to delete.");
  }

  const result = await db.$transaction(async (tx) => {
    const achievement = await tx.achievement.findUnique({
      where: { id: achievementId },
    });

    if (!achievement) {
      return "Achievement not found.";
    }

    await tx.achievement.delete({
      where: { id: achievementId },
    });

    return `Achievement "${achievement.name}" deleted.`;
  });

  return done(result);
}

