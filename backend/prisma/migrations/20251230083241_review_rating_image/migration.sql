-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "image" TEXT,
ADD COLUMN     "rating" INTEGER NOT NULL DEFAULT 5;
