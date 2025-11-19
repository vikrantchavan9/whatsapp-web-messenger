/*
  Warnings:

  - You are about to drop the column `attachment_url` on the `user_whatsapp` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user_whatsapp" DROP COLUMN "attachment_url",
ADD COLUMN     "attachment_path" TEXT;
