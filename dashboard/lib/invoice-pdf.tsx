import { Document, Page, View, Text, Link, StyleSheet } from "@react-pdf/renderer";
import type { InvoiceData } from "./invoice";

const money = (m: number) => `$${(m / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const C = { ink: "#0b0f17", muted: "#6b7280", line: "#e5e7eb", panel: "#f8fafc", good: "#15803d", accent: "#111827", white: "#ffffff", link: "#2563eb" };

// Seller (The Credit Brothers) details for the invoice header. Hardcoded — these
// change rarely and there is no settings surface for them.
const COMPANY = {
  legalName: "Steil Enterprises LLC",
  phone: "(512) 882-0599",
  address: "895 Main Street, Wilbraham, MA, 01095, US",
  website: "http://thecreditbrothers.com/",
  websiteLabel: "thecreditbrothers.com",
};

const TERMS =
  "Payment is due within 3 days of the issue date. For payment plans, the card you use today is securely stored and automatically charged for each remaining installment on its due date. Prices are tax inclusive. Questions about this invoice? Call (512) 882-0599 or reply to the email it came from. Thank you for your business.";

const st = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: C.ink },
  docTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 14 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  seller: { fontSize: 8, color: C.muted, marginTop: 2 },
  sellerLink: { fontSize: 8, color: C.link, marginTop: 2 },
  terms: { fontSize: 9, color: C.muted, lineHeight: 1.4 },
  invTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right" },
  meta: { fontSize: 9, color: C.muted, textAlign: "right", marginTop: 2 },
  section: { marginTop: 22 },
  smallLabel: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 5 },
  td: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  cH: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  totalsBox: { marginTop: 16, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  dueRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: C.line },
  payBtn: { marginTop: 22, backgroundColor: C.accent, borderRadius: 6, paddingVertical: 10, textAlign: "center" },
  payBtnText: { color: C.white, fontFamily: "Helvetica-Bold", fontSize: 12 },
  linkText: { marginTop: 8, fontSize: 9, color: "#2563eb", textAlign: "center" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: C.muted, textAlign: "center" },
});

// column widths — item table: Item, Price, Qty, Tax, Subtotal
const col = {
  item: { width: "46%" }, price: { width: "16%", textAlign: "right" as const },
  qty: { width: "10%", textAlign: "right" as const }, tax: { width: "12%", textAlign: "right" as const },
  sub: { width: "16%", textAlign: "right" as const },
};
// schedule columns: Payment X of Y, Due, Amount, Status
const sc = {
  pay: { width: "38%" }, due: { width: "27%" },
  amt: { width: "18%", textAlign: "right" as const }, stat: { width: "17%", textAlign: "right" as const },
};

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  return (
    <Document title={`Invoice ${data.invoiceNumber}`}>
      <Page size="A4" style={st.page}>
        {/* header: title + seller block (left) / invoice meta (right) */}
        <Text style={st.docTitle}>New Invoice from The Credit Brothers</Text>
        <View style={st.row}>
          <View style={{ maxWidth: 300 }}>
            <Text style={st.brand}>THE CREDIT BROTHERS</Text>
            <Text style={st.seller}>{COMPANY.legalName}</Text>
            <Text style={st.seller}>{COMPANY.phone}</Text>
            <Text style={st.seller}>{COMPANY.address}</Text>
            <Link src={COMPANY.website} style={st.sellerLink}>{COMPANY.websiteLabel}</Link>
          </View>
          <View>
            <Text style={st.invTitle}>INVOICE</Text>
            <Text style={st.meta}>{data.invoiceNumber}</Text>
            <Text style={st.meta}>Issued {fmtDate(data.issueDate)}</Text>
            <Text style={st.meta}>Due {fmtDate(data.dueDate)}</Text>
          </View>
        </View>

        {/* bill to */}
        <View style={st.section}>
          <Text style={st.smallLabel}>Bill to</Text>
          <Text>{data.billToName}</Text>
          {!!data.billToEmail && <Text style={{ color: C.muted, marginTop: 1 }}>{data.billToEmail}</Text>}
          {!!data.billToPhone && <Text style={{ color: C.muted, marginTop: 1 }}>{data.billToPhone}</Text>}
        </View>

        {/* item table */}
        <View style={st.section}>
          <View style={st.th}>
            <Text style={[st.cH, col.item]}>Item</Text>
            <Text style={[st.cH, col.price]}>Price</Text>
            <Text style={[st.cH, col.qty]}>Qty</Text>
            <Text style={[st.cH, col.tax]}>Tax</Text>
            <Text style={[st.cH, col.sub]}>Subtotal</Text>
          </View>
          <View style={st.td}>
            <Text style={col.item}>{data.itemDescription}</Text>
            <Text style={col.price}>{money(data.totalMinor)}</Text>
            <Text style={col.qty}>1</Text>
            <Text style={col.tax}>Incl.</Text>
            <Text style={col.sub}>{money(data.totalMinor)}</Text>
          </View>
        </View>

        {/* payment schedule (plans only) */}
        {data.isPlan && (
          <View style={st.section}>
            <Text style={st.smallLabel}>Payment schedule{data.frequency ? ` · ${data.frequency}` : ""}</Text>
            <View style={st.th}>
              <Text style={[st.cH, sc.pay]}>Payment</Text>
              <Text style={[st.cH, sc.due]}>Due date</Text>
              <Text style={[st.cH, sc.amt]}>Amount</Text>
              <Text style={[st.cH, sc.stat]}>Status</Text>
            </View>
            {data.schedule.map((s) => (
              <View key={s.no} style={st.td}>
                <Text style={sc.pay}>Payment {s.no} of {data.schedule.length}</Text>
                <Text style={sc.due}>{fmtDate(s.dueDate)}{s.no === 1 ? " (today)" : ""}</Text>
                <Text style={sc.amt}>{money(s.amountMinor)}</Text>
                <Text style={[sc.stat, { color: s.status === "paid" ? C.good : C.muted, fontFamily: s.status === "paid" ? "Helvetica-Bold" : "Helvetica" }]}>
                  {s.status === "paid" ? "Paid" : "Pending"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* totals */}
        <View style={st.totalsBox}>
          <View style={st.totalRow}><Text style={{ color: C.muted }}>Subtotal</Text><Text>{money(data.totalMinor)}</Text></View>
          <View style={st.totalRow}><Text style={{ color: C.muted }}>Total (USD)</Text><Text>{money(data.totalMinor)}</Text></View>
          <View style={st.totalRow}><Text style={{ color: C.muted }}>Amount paid (USD)</Text><Text>{money(data.paidMinor)}</Text></View>
          <View style={st.dueRow}><Text style={{ fontFamily: "Helvetica-Bold" }}>Amount due (USD)</Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{money(data.dueMinor)}</Text></View>
        </View>

        {/* pay button + clickable link (skip when fully paid) */}
        {data.dueMinor > 0 && (
          <View>
            <Link src={data.payUrl} style={st.payBtn}><Text style={st.payBtnText}>Pay {money(data.dueMinor)}</Text></Link>
            <Link src={data.payUrl} style={st.linkText}>{data.payUrl}</Link>
          </View>
        )}

        {/* terms & notes */}
        <View style={st.section}>
          <Text style={st.smallLabel}>Terms &amp; notes</Text>
          <Text style={st.terms}>{TERMS}</Text>
        </View>

        <Text style={st.footer} fixed>Secured by NMI. Your card details are encrypted. Price is tax inclusive.</Text>
      </Page>
    </Document>
  );
}
