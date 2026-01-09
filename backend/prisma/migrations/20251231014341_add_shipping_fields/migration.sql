-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "address" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "recipientName" TEXT;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "defaultAddress" TEXT,
ADD COLUMN     "defaultPhone" TEXT,
ADD COLUMN     "defaultRecipientName" TEXT;
