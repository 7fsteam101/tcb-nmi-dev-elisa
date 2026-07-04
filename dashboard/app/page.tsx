import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default function Home() {
  redirect("/overview");
}
