/*
  Warnings:

  - A unique constraint covering the columns `[msg_id]` on the table `user_whatsapp` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "user_whatsapp_msg_id_key" ON "user_whatsapp"("msg_id");
