import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUpcomingWeekdaySlots, isBookableSlotDate } from "@/lib/interview-slots";

// Artist interview booking. GET returns the rolling window of bookable
// weekdays with live availability; POST books one. The unique index on
// InterviewSlot.slotDate (see the migration) is the actual guard against
// double-booking — two artists racing for the same day can't both win, the
// second POST's INSERT just no-ops and gets told to pick another slot.

const bookingSchema = z.object({
  artistName: z.string().trim().min(1).max(160),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(32)
    .regex(/^[+\d\s().-]+$/),
  imessage: z.string().trim().min(1).max(200),
  slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function getSqlClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return neon(databaseUrl);
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function GET() {
  const slots = getUpcomingWeekdaySlots();
  const sql = getSqlClient();

  const rows = (await sql`
    SELECT to_char("slotDate", 'YYYY-MM-DD') AS "date"
    FROM "InterviewSlot"
    WHERE "slotDate" = ANY(${slots.map((slot) => slot.date)}::date[])
  `) as { date: string }[];

  const bookedDates = new Set(rows.map((row) => row.date));

  return NextResponse.json({
    slots: slots.map((slot) => ({ ...slot, available: !bookedDates.has(slot.date) })),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = bookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { artistName, phone, imessage, slotDate } = parsed.data;

    // Re-validate server-side — the client only ever shows dates from GET,
    // but never trust that a request actually came from that render.
    if (!isBookableSlotDate(slotDate)) {
      return NextResponse.json(
        { error: "That date isn't open for booking. Pick one of the listed times." },
        { status: 400 }
      );
    }

    const sql = getSqlClient();
    const inserted = await sql`
      INSERT INTO "InterviewSlot" ("artistName", "phone", "imessage", "slotDate", "createdAt")
      VALUES (${artistName}, ${phone}, ${imessage}, ${slotDate}::date, NOW())
      ON CONFLICT ("slotDate") DO NOTHING
      RETURNING id
    `;

    if (inserted.length === 0) {
      return NextResponse.json(
        {
          error: "That slot was just booked by someone else. Pick another time.",
          code: "SLOT_TAKEN",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        {
          error: "That slot was just booked by someone else. Pick another time.",
          code: "SLOT_TAKEN",
        },
        { status: 409 }
      );
    }

    console.error("[interview] booking error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
