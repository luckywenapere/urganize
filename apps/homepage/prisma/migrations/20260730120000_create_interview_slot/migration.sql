CREATE TABLE IF NOT EXISTS "InterviewSlot" (
    "id" SERIAL NOT NULL,
    "artistName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "imessage" TEXT NOT NULL,
    "slotDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InterviewSlot_slotDate_key" ON "InterviewSlot"("slotDate");
