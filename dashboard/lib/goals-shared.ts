// Client-safe goal constants + types (NO database import), so client
// components can use them without dragging postgres into the browser bundle.
export type Metric = "calls_booked" | "calls_taken" | "cash_collected" | "deals_won" | "clients";
export type Period = "weekly" | "monthly" | "quarterly";

export const METRIC_LABEL: Record<Metric, string> = {
  calls_booked: "Calls booked",
  calls_taken: "Calls taken",
  cash_collected: "Cash collected",
  deals_won: "Deals won",
  clients: "New clients",
};

export const isMoneyMetric = (m: Metric) => m === "cash_collected";
