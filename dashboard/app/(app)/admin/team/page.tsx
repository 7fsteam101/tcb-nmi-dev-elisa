import { sql } from "@/lib/db";
import { TeamEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function TeamAdmin() {
  const reps = await sql`select id, full_name, email, role, active from sales.rep order by active desc, full_name`;
  return <TeamEditor reps={reps as never} />;
}
