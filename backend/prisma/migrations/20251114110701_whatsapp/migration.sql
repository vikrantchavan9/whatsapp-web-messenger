-- CreateTable
CREATE TABLE "user_whatsapp" (
    "whatsID" BIGSERIAL NOT NULL,
    "msg_id" TEXT NOT NULL,
    "in_out" TEXT NOT NULL,
    "sender" TEXT,
    "receiver" TEXT,
    "message" TEXT,
    "edate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_whatsapp_pkey" PRIMARY KEY ("whatsID")
);
