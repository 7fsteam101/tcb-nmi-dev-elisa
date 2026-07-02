import { formOptions } from "../lib/form-options";
const t = Date.now();
formOptions().then((o) => {
  console.log("formOptions OK in", Date.now() - t, "ms:",
    Object.entries(o).map(([k, v]) => `${k}=${(v as unknown[]).length}`).join(" "));
  process.exit(0);
}).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
