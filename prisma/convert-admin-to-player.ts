
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const username = process.env.OLD_ADMIN_USERNAME?.toLowerCase();

  if (!username) {
    throw new Error("OLD_ADMIN_USERNAME is missing");
  }

  const user = await db.user.findUnique({
    where: { username },
  });

  if (!user) {
    throw new Error("User not found");
  }

  await db.user.update({
    where: { username },
    data: { role: "player" },
  });

  console.log("Account successfully converted to player.");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
