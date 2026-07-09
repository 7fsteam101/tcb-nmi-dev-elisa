import { Document, Page, View, Text, Link, StyleSheet } from "@react-pdf/renderer";
import type { InvoiceData } from "./invoice";

const money = (m: number) => `$${(m / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const C = { ink: "#0b0f17", muted: "#6b7280", line: "#e5e7eb", panel: "#f8fafc", good: "#15803d", accent: "#111827", white: "#ffffff" };

const st = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: C.ink },
  row: { flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  caption: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 },
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
// schedule columns: #, Due, Amount, Status
const sc = {
  no: { width: "10%" }, due: { width: "45%" },
  amt: { width: "25%", textAlign: "right" as const }, stat: { width: "20%", textAlign: "right" as const },
};

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  return (
    <Document title={`Invoice ${data.invoiceNumber}`}>
      <Page size="A4" style={st.page}>
        {/* header */}
        <View style={st.row}>
          <View>
            <Text style={st.brand}>THE CREDIT BROTHERS</Text>
            <Text style={st.caption}>Pro forma invoice</Text>
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
              <Text style={[st.cH, sc.no]}>#</Text>
              <Text style={[st.cH, sc.due]}>Due date</Text>
              <Text style={[st.cH, sc.amt]}>Amount</Text>
              <Text style={[st.cH, sc.stat]}>Status</Text>
            </View>
            {data.schedule.map((s) => (
              <View key={s.no} style={st.td}>
                <Text style={sc.no}>{s.no}</Text>
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
          <View style={st.totalRow}><Text style={{ color: C.muted }}>Total</Text><Text>{money(data.totalMinor)}</Text></View>
          <View style={st.totalRow}><Text style={{ color: C.muted }}>Amount paid</Text><Text>{money(data.paidMinor)}</Text></View>
          <View style={st.dueRow}><Text style={{ fontFamily: "Helvetica-Bold" }}>Amount due</Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{money(data.dueMinor)}</Text></View>
        </View>

        {/* pay button + clickable link (skip when fully paid) */}
        {data.dueMinor > 0 && (
          <View>
            <Link src={data.payUrl} style={st.payBtn}><Text style={st.payBtnText}>Pay {money(data.dueMinor)}</Text></Link>
            <Link src={data.payUrl} style={st.linkText}>{data.payUrl}</Link>
          </View>
        )}

        <Text style={st.footer} fixed>Secured by NMI. Your card details are encrypted. Price is tax inclusive.</Text>
      </Page>
    </Document>
  );
}
