import type { Metadata } from "next";
import { neon } from "@neondatabase/serverless";
import { requireDashboardAuth } from "@/lib/dashboard-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: { absolute: "Interviews | Urganize" },
  robots: { index: false, follow: false },
};

type InterviewRow = {
  id: number;
  artistName: string;
  phone: string;
  imessage: string;
  date: string;
  bookedAt: string;
};

function getSqlClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return neon(databaseUrl);
}

async function getInterviewSlots(): Promise<InterviewRow[]> {
  const sql = getSqlClient();

  const rows = (await sql`
    SELECT
      id,
      "artistName",
      phone,
      imessage,
      to_char("slotDate", 'FMDay, FMMon FMDD, YYYY') AS "date",
      to_char("createdAt", 'YYYY-MM-DD HH24:MI') AS "bookedAt"
    FROM "InterviewSlot"
    ORDER BY "slotDate" ASC
  `) as InterviewRow[];

  return rows;
}

export default async function InterviewsPage() {
  await requireDashboardAuth();

  const slots = await getInterviewSlots();

  return (
    <div className="p-5 lg:p-8">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#8da29a]">Interviews</p>
      <h1 className="mt-2 font-sans text-2xl font-semibold tracking-[-0.03em] text-white">
        Booked slots ({slots.length})
      </h1>
      <p className="mt-1 text-sm text-[#8da29a]">Every slot below is 6:00 PM West Africa Time.</p>

      {slots.length === 0 ? (
        <p className="mt-6 text-sm text-[#8da29a]">No interviews booked yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-[#8da29a]">
                <th className="px-4 py-3 font-medium">Interview day</th>
                <th className="px-4 py-3 font-medium">Artist</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">iMessage</th>
                <th className="px-4 py-3 font-medium">Booked on</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.id} className="border-b border-white/5 text-[#d7e4d9] last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-white">{slot.date}</td>
                  <td className="px-4 py-3">{slot.artistName}</td>
                  <td className="whitespace-nowrap px-4 py-3">{slot.phone}</td>
                  <td className="px-4 py-3">{slot.imessage}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-[#8da29a]">{slot.bookedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
