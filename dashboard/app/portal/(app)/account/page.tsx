import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal-auth";
import { getPortalCustomer, getPortalFeatures } from "@/lib/portal";
import { AccountForm } from "./form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  const [customer, f] = [await getPortalCustomer(session.contactId), await getPortalFeatures()];
  if (!customer) redirect("/portal/login");
  if (!f.editBusinessInfo) redirect("/portal");
  const accent = f.brandAccent && f.brandAccent.trim() ? f.brandAccent : "#3b82f6";

  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Account information</h1>
      <p style={{ color: "#8aa0bd", marginTop: 4 }}>Update your business and contact details.</p>
      <AccountForm
        accent={accent}
        initial={{
          first_name: customer.first_name ?? "",
          last_name: customer.last_name ?? "",
          company_name: customer.company_name ?? "",
          website: customer.website ?? "",
          primary_phone: customer.primary_phone ?? "",
          primary_email: customer.primary_email ?? "",
        }}
      />
    </>
  );
}
