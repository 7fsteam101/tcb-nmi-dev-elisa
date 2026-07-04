import { requireAccess } from "@/lib/access";
import { listProducts } from "./actions";
import { ProductsEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ProductsAdmin() {
  const user = await requireAccess("receivables");
  const canWrite = user.role === "admin" || user.role === "leadership";
  const products = await listProducts();
  return (
    <div>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        These are the products that can be sold and charged. Set the price in dollars, mark a product active to make it
        sellable, and allow a payment plan to let it be split into installments. Changes take effect immediately.
      </p>
      <ProductsEditor products={products as never} canWrite={canWrite} />
    </div>
  );
}
