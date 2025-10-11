export const REQUIRED_COLUMNS = [
  "Production_Tons",
  "Fuel_Consumption_Liters",
  "Operating_Hours",
  "Maintenance_Duration_Hours",
  "Downtime_Hours",
  "Maintenance_Cost_USD",
  "Fuel_Efficiency_TonPerLiter",
] as const;

export function toTwoDecimals(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function validateHeader(header: string[]) {
  const missing = REQUIRED_COLUMNS.filter(
    (c) => !header.some((h) => h.toLowerCase() === c.toLowerCase())
  );
  return missing.length === 0
    ? { ok: true, message: "Schema OK" }
    : { ok: false, message: `Missing columns: ${missing.join(", ")}` };
}
