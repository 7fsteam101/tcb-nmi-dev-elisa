import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Revenue was folded into the Deals ledger (Katie, July 9): one page that shows
// every deal with contracted vs collected money. Old links and bookmarks still
// land here, so keep the route and send them on.
export default function Revenue() {
  redirect("/deals");
}
