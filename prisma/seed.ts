import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
async function main() {
  const username = (process.env.ADMIN_USERNAME || "dm").toLowerCase();
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("Set ADMIN_PASSWORD in .env");
  const passwordHash = await bcrypt.hash(pw, 12);
  await db.user.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash, role: "admin", displayName: "Dungeon Master", hasPriority: true },
  });
  console.log(`Admin ready: ${username}`);
}
main().finally(() => db.$disconnect());
