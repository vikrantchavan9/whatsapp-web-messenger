-- CreateTable
CREATE TABLE "users" (
    "userID" BIGSERIAL NOT NULL,
    "whatsapp" BIGINT NOT NULL,
    "name" VARCHAR NOT NULL,
    "pas" VARCHAR NOT NULL,
    "veridytpe" CHAR(1) NOT NULL,
    "verID" VARCHAR NOT NULL,
    "mobile" BIGINT NOT NULL,
    "email" VARCHAR NOT NULL,
    "pic_url" VARCHAR NOT NULL,
    "gender" CHAR(1) NOT NULL,
    "dob" DATE NOT NULL,
    "langID" SMALLINT[],
    "placeID" INTEGER NOT NULL,
    "refercode" VARCHAR NOT NULL,
    "referby" BIGINT NOT NULL,
    "advisor" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactive" VARCHAR,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "euserID" BIGINT NOT NULL,
    "edate" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("userID")
);
