-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "parentId" INTEGER;

-- CreateIndex
CREATE INDEX "Review_parentId_idx" ON "Review"("parentId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
