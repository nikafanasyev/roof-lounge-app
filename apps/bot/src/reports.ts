import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

// Excel-отчёты, которые бот собирает сам и присылает в личку (см. запрос
// Никиты 12.11.2026: "формировать Excel и отправлять мне в личку").
// Итоги — живые формулы, как в выгрузке из мини-аппа.

const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** Зарплатные периоды 11–24 и 25–10 (копия getPayrollPeriodForDate из мини-аппа). */
export function payrollPeriodForDate(dateIso: string) {
  const [year, month, day] = dateIso.split("-").map(Number);
  if (day >= 11 && day <= 24) return { start: ymd(year, month, 11), end: ymd(year, month, 24) };
  if (day >= 25) return { start: ymd(year, month, 25), end: ymd(year, month + 1, 10) };
  return { start: ymd(year, month - 1, 25), end: ymd(year, month, 10) };
}

const fmtDate = (iso: string) => iso.split("-").reverse().join(".");
const ROLE_LABELS: Record<string, string> = { bar: "Бар", hookah: "Кальяны" };

type SalaryModel =
  | { type: "fixed"; value: number }
  | { type: "percent"; value: number }
  | { type: "fixed_plus_percent"; base: number; percent: number };

function salaryFormula(m: SalaryModel | null, ref: string): string {
  if (!m || m.type === "fixed") return "";
  if (m.type === "percent") return `ROUND(${ref}*${m.value}/100,0)`;
  return `ROUND(${m.base}+${ref}*${m.percent}/100,0)`;
}
function rateLabel(m: SalaryModel | null): string {
  if (!m) return "";
  if (m.type === "fixed") return `фикс. ${m.value} ₽/смена`;
  if (m.type === "percent") return `${m.value}% от выручки`;
  return `${m.base} ₽ + ${m.percent}%`;
}

function whiteSheet(sheet: ExcelJS.Worksheet, cols: number) {
  sheet.eachRow((row) => {
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      cell.font = { ...(cell.font ?? {}), color: cell.font?.color ?? { argb: "FF000000" } };
    }
  });
}

export async function buildSalaryWorkbook(supabase: SupabaseClient, periodStart: string) {
  const period = payrollPeriodForDate(periodStart);
  const label = `${fmtDate(period.start)} – ${fmtDate(period.end)}`;

  const { data: staff } = await supabase.from("staff").select("id, name, salary_model, archived").order("name");
  const staffRows = ((staff ?? []) as { id: string; name: string; salary_model: SalaryModel | null; archived: boolean | null }[]).filter((s) => !s.archived);
  const [shiftsRes, adjRes, fixedRes] = await Promise.all([
    supabase.from("shift_payroll").select("staff_id, date, role, revenue, salary").gte("date", period.start).lte("date", period.end).order("date"),
    supabase.from("adjustments").select("staff_id, type, amount, reason, date, deleted_at").gte("date", period.start).lte("date", period.end).order("date"),
    supabase.from("fixed_accruals").select("staff_id, amount, label, active"),
  ]);
  const shifts = (shiftsRes.data ?? []) as { staff_id: string; date: string; role: string | null; revenue: number; salary: number }[];
  const adjs = ((adjRes.data ?? []) as { staff_id: string; type: string; amount: number; reason: string; date: string; deleted_at: string | null }[]).filter((a) => !a.deleted_at);
  const fixed = ((fixedRes.data ?? []) as { staff_id: string; amount: number; label: string | null; active: boolean }[]).filter((f) => f.active);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Roof Lounge bot";
  const sheet = wb.addWorksheet("Зарплата");
  sheet.columns = [{ width: 16 }, { width: 12 }, { width: 14 }, { width: 22 }, { width: 16 }];
  sheet.addRow([`Зарплатная ведомость — Roof Lounge · ${label}`]).font = { bold: true, size: 14 };
  sheet.addRow([`Выгружено ${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}`]).font = { italic: true, color: { argb: "FF888888" } };
  sheet.addRow([]);

  const payoutRefs: string[] = [];
  for (const s of staffRows) {
    const sh = shifts.filter((x) => x.staff_id === s.id);
    const ad = adjs.filter((x) => x.staff_id === s.id);
    const fx = fixed.filter((x) => x.staff_id === s.id);
    if (!sh.length && !ad.length && !fx.length) continue;

    const nameRow = sheet.addRow([s.name]);
    nameRow.font = { bold: true, size: 12 };
    sheet.mergeCells(nameRow.number, 1, nameRow.number, 5);
    sheet.addRow(["Дата / статья", "Роль", "Выручка, ₽", "Ставка", "Сумма, ₽"]).font = { bold: true, color: { argb: "FF888888" } };

    const amountRefs: string[] = [];
    for (const x of sh) {
      const row = sheet.addRow([fmtDate(x.date).slice(0, 5), x.role ? ROLE_LABELS[x.role] ?? x.role : "", Number(x.revenue), rateLabel(s.salary_model), 0]);
      const f = salaryFormula(s.salary_model, `C${row.number}`);
      row.getCell(5).value = f ? { formula: f, result: Number(x.salary) } : Number(x.salary);
      row.getCell(5).numFmt = "#,##0";
      amountRefs.push(`E${row.number}`);
    }
    for (const a of ad) {
      const row = sheet.addRow([fmtDate(a.date).slice(0, 5), a.type === "fine" ? "Штраф" : "Премия", "", a.reason, a.type === "fine" ? -Number(a.amount) : Number(a.amount)]);
      row.getCell(5).numFmt = "#,##0";
      amountRefs.push(`E${row.number}`);
    }
    for (const f of fx) {
      const row = sheet.addRow(["", "", "", f.label || "Фикс. начисление", Number(f.amount)]);
      row.getCell(5).numFmt = "#,##0";
      amountRefs.push(`E${row.number}`);
    }
    const total = sheet.addRow(["", "", "", "ИТОГО к выплате", 0]);
    total.font = { bold: true };
    total.getCell(5).value = { formula: `SUM(${amountRefs.join(",")})`, result: 0 };
    total.getCell(5).numFmt = "#,##0";
    payoutRefs.push(`E${total.number}`);
    sheet.addRow([]);
  }

  const grand = sheet.addRow(["", "", "", "ИТОГО НА РУКИ", 0]);
  grand.font = { bold: true, size: 12 };
  grand.getCell(5).value = payoutRefs.length ? { formula: `SUM(${payoutRefs.join(",")})`, result: 0 } : 0;
  grand.getCell(5).numFmt = "#,##0";
  const ndfl = sheet.addRow(["", "", "", "НДФЛ 13% (сверху)", 0]);
  ndfl.getCell(5).value = { formula: `ROUND(E${grand.number}*13/87,0)`, result: 0 };
  ndfl.getCell(5).numFmt = "#,##0";
  const gross = sheet.addRow(["", "", "", "ИТОГО + НДФЛ", 0]);
  gross.font = { bold: true, size: 12 };
  gross.getCell(5).value = { formula: `E${grand.number}+E${ndfl.number}`, result: 0 };
  gross.getCell(5).numFmt = "#,##0";
  whiteSheet(sheet, 5);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename: `зарплата-${period.start}.xlsx`, caption: `Зарплатная ведомость ${label}` };
}

const MONTHS_RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

export async function buildExpensesWorkbook(supabase: SupabaseClient, monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const start = ymd(y, m, 1);
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const [expRes, incRes] = await Promise.all([
    supabase.from("expenses").select("date, category, supplier, department, amount, note, created_by_name, deleted_at").gte("date", start).lte("date", lastDay).order("date"),
    supabase.from("incomes").select("date, category, amount, note, created_by_name, deleted_at").gte("date", start).lte("date", lastDay).order("date"),
  ]);
  const expenses = ((expRes.data ?? []) as any[]).filter((r) => !r.deleted_at);
  const incomes = ((incRes.data ?? []) as any[]).filter((r) => !r.deleted_at);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Roof Lounge bot";
  const title = `${MONTHS_RU[m - 1]} ${y}`;

  const eSheet = wb.addWorksheet("Расходы");
  eSheet.columns = [{ width: 12 }, { width: 22 }, { width: 20 }, { width: 12 }, { width: 14 }, { width: 30 }, { width: 18 }];
  eSheet.addRow([`Расходы — ${title}`]).font = { bold: true, size: 14 };
  eSheet.addRow([]);
  eSheet.addRow(["Дата", "Статья", "Поставщик", "Раздел", "Сумма, ₽", "Комментарий", "Провёл"]).font = { bold: true, color: { argb: "FF888888" } };
  const eFirst = eSheet.rowCount + 1;
  for (const r of expenses) {
    const row = eSheet.addRow([fmtDate(r.date).slice(0, 5), r.category, r.supplier ?? "", r.department ?? "", Number(r.amount), r.note ?? "", r.created_by_name ?? ""]);
    row.getCell(5).numFmt = "#,##0";
  }
  const eLast = eSheet.rowCount;
  const eTotal = eSheet.addRow(["", "", "", "ИТОГО", expenses.length ? { formula: `SUM(E${eFirst}:E${eLast})`, result: 0 } : 0]);
  eTotal.font = { bold: true };
  eTotal.getCell(5).numFmt = "#,##0";
  whiteSheet(eSheet, 7);

  const iSheet = wb.addWorksheet("Доходы");
  iSheet.columns = [{ width: 12 }, { width: 24 }, { width: 14 }, { width: 30 }, { width: 18 }];
  iSheet.addRow([`Доходы (ручной ввод) — ${title}`]).font = { bold: true, size: 14 };
  iSheet.addRow([]);
  iSheet.addRow(["Дата", "Статья", "Сумма, ₽", "Комментарий", "Провёл"]).font = { bold: true, color: { argb: "FF888888" } };
  const iFirst = iSheet.rowCount + 1;
  for (const r of incomes) {
    const row = iSheet.addRow([fmtDate(r.date).slice(0, 5), r.category, Number(r.amount), r.note ?? "", r.created_by_name ?? ""]);
    row.getCell(3).numFmt = "#,##0";
  }
  const iLast = iSheet.rowCount;
  const iTotal = iSheet.addRow(["", "ИТОГО", incomes.length ? { formula: `SUM(C${iFirst}:C${iLast})`, result: 0 } : 0]);
  iTotal.font = { bold: true };
  iTotal.getCell(3).numFmt = "#,##0";
  whiteSheet(iSheet, 5);

  // Итоги по разделам — формулами по листу "Расходы".
  const sSheet = wb.addWorksheet("Итоги");
  sSheet.columns = [{ width: 26 }, { width: 16 }];
  sSheet.addRow([`Итоги — ${title}`]).font = { bold: true, size: 14 };
  sSheet.addRow([]);
  sSheet.addRow(["Раздел расходов", "Сумма, ₽"]).font = { bold: true, color: { argb: "FF888888" } };
  const depts = Array.from(new Set(expenses.map((r) => r.department || "Без раздела")));
  const range = (col: string) => `Расходы!${col}${eFirst}:${col}${Math.max(eLast, eFirst)}`;
  for (const d of depts) {
    const crit = d === "Без раздела" ? `""` : `"${d}"`;
    const row = sSheet.addRow([d, { formula: `SUMIF(${range("D")},${crit},${range("E")})`, result: 0 }]);
    row.getCell(2).numFmt = "#,##0";
  }
  sSheet.addRow([]);
  const exp = sSheet.addRow(["Расходы всего", { formula: `Расходы!E${eTotal.number}`, result: 0 }]);
  const inc = sSheet.addRow(["Доходы (ручной ввод)", { formula: `Доходы!C${iTotal.number}`, result: 0 }]);
  const bal = sSheet.addRow(["Баланс", { formula: `B${inc.number}-B${exp.number}`, result: 0 }]);
  bal.font = { bold: true };
  [exp, inc, bal].forEach((r) => (r.getCell(2).numFmt = "#,##0"));
  whiteSheet(sSheet, 2);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename: `расходы-${monthKey}.xlsx`, caption: `Расходы и доходы — ${title}` };
}
