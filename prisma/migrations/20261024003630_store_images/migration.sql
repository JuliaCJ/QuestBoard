/*
  Warnings:

  - You are about to drop the column `imageUrl` on the `ShopItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ShopItem" DROP COLUMN "imageUrl";

-- CreateTable
CREATE TABLE "ItemImage" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemImage_itemId_key" ON "ItemImage"("itemId");

-- AddForeignKey
ALTER TABLE "ItemImage" ADD CONSTRAINT "ItemImage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ShopItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
