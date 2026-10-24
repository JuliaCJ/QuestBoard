/*
  Warnings:

  - Added the required column `labelId` to the `ShopItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ShopItem" ADD COLUMN     "labelId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ItemLabel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemLabel_name_key" ON "ItemLabel"("name");

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "ItemLabel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
