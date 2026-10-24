-- CreateTable
CREATE TABLE "ShopItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'consumable',
    "imageUrl" TEXT,
    "statSheet" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemLink" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemLink_itemId_idx" ON "ItemLink"("itemId");

-- AddForeignKey
ALTER TABLE "ItemLink" ADD CONSTRAINT "ItemLink_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ShopItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
