import type { Adjustment, FixedAccrual, SalaryModel, ShiftPayrollEntry, StaffProfile } from "@/types";
import { getPayrollPeriodForDate, groupShiftsByPayrollPeriod } from "@/data/repo";

export interface SalaryExportStaffInput {
  profile: StaffProfile;
  shifts: ShiftPayrollEntry[];
  adjustments: Adjustment[]; // штрафы/премии этого сотрудника
  fixedAccruals: FixedAccrual[];
}

const ROLE_LABELS: Record<string, string> = { bar: "Бар", hookah: "Кальяны" };

function salaryFormula(model: SalaryModel, revenueCellRef: string): string {
  if (model.type === "fixed") return "";
  if (model.type === "percent") return `ROUND(${revenueCellRef}*${model.value}/100,0)`;
  return `ROUND(${model.base}+${revenueCellRef}*${model.percent}/100,0)`;
}

function rateLabel(model: SalaryModel): string {
  if (model.type === "fixed") return `фикс. ${model.value.toLocaleString("ru-RU")} ₽/смена`;
  if (model.type === "percent") return `${model.value}% от выручки`;
  return `${model.base.toLocaleString("ru-RU")} ₽ + ${model.percent}%`;
}

/**
 * Зарплатная ведомость в Excel с живыми формулами (а не просто цифрами) —
 * см. запрос Никиты 14.10.2026: "в идеале сохраняя формулы расчёта каждой
 * смены и итоговой выплаты каждому сотруднику". ЗП каждой смены — формула от
 * выручки по salary_model сотрудника (так же, как считает бот при начислении,
 * см. computeShiftSalary в lib/payroll.ts), итог по сотруднику и общий
 * итог/НДФЛ — тоже формулы, пересчитываются прямо в Excel при правке цифр.
 *
 * exceljs загружается динамически (~1MB), чтобы не раздувать основной бандл
 * мини-аппа ради одной редко нажимаемой кнопки.
 */
export async function exportSalaryWorkbook(staffInputs: SalaryExportStaffInput[], generatedAt: Date = new Date()) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Roof Lounge miniapp";
  workbook.created = generatedAt;
  const sheet = workbook.addWorksheet("Зарплата");
  sheet.columns = [
    { key: "a", width: 16 },
    { key: "b", width: 12 },
    { key: "c", width: 14 },
    { key: "d", width: 20 },
    { key: "e", width: 16 },
  ];

  sheet.addRow([`Зарплатная ведомость — Roof Lounge`]).font = { bold: true, size: 14 };
  sheet.addRow([`Выгружено ${generatedAt.toLocaleDateString("ru-RU")} ${generatedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`]).font = {
    italic: true,
    color: { argb: "FF888888" },
  };
  sheet.addRow([]);

  const payoutCellRefs: string[] = []; // "ИТОГО к выплате" каждого сотрудника — для общего итога внизу

  for (const input of staffInputs) {
    if (!input.shifts.length && !input.fixedAccruals.length && !input.adjustments.length) continue;

    const nameRow = sheet.addRow([input.profile.name]);
    nameRow.font = { bold: true, size: 12 };
    sheet.mergeCells(nameRow.number, 1, nameRow.number, 5);

    const headerRow = sheet.addRow(["Дата / статья", "Роль", "Выручка, ₽", "Ставка", "Сумма, ₽"]);
    headerRow.font = { bold: true, color: { argb: "FF888888" } };

    const amountCellRefs: string[] = []; // все строки, формирующие итог этого сотрудника

    const periods = groupShiftsByPayrollPeriod(input.shifts, "desc");
    for (const period of periods) {
      const periodRow = sheet.addRow([period.label]);
      periodRow.font = { italic: true, color: { argb: "FF888888" } };
      sheet.mergeCells(periodRow.number, 1, periodRow.number, 5);

      for (const shift of period.shifts) {
        const row = sheet.addRow([
          new Date(`${shift.date}T12:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
          shift.role ? ROLE_LABELS[shift.role] ?? shift.role : "",
          shift.revenue,
          rateLabel(input.profile.salaryModel),
          0,
        ]);
        const revenueCellRef = `C${row.number}`;
        const formula = salaryFormula(input.profile.salaryModel, revenueCellRef);
        const amountCell = row.getCell(5);
        if (formula) amountCell.value = { formula, result: shift.salary };
        else amountCell.value = shift.salary; // фиксированная ставка не зависит от выручки — формула не нужна
        amountCell.numFmt = "#,##0";
        amountCellRefs.push(`E${row.number}`);
      }

      // Штрафы/премии этого сотрудника, попавшие в данный период (по дате) — показываем рядом со сменами.
      for (const adj of input.adjustments.filter((a) => getPayrollPeriodForDate(a.date).start === period.key)) {
        const signedAmount = adj.type === "fine" ? -adj.amount : adj.amount;
        const row = sheet.addRow([
          new Date(adj.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
          adj.type === "fine" ? "Штраф" : "Премия",
          "",
          adj.reason,
          signedAmount,
        ]);
        row.getCell(5).numFmt = "#,##0";
        amountCellRefs.push(`E${row.number}`);
      }
    }

    if (input.fixedAccruals.length) {
      const fixedHeaderRow = sheet.addRow(["Фиксированные начисления"]);
      fixedHeaderRow.font = { italic: true, color: { argb: "FF888888" } };
      sheet.mergeCells(fixedHeaderRow.number, 1, fixedHeaderRow.number, 5);
      for (const f of input.fixedAccruals) {
        const row = sheet.addRow(["", "", "", f.label || "Начисление", f.amount]);
        row.getCell(5).numFmt = "#,##0";
        amountCellRefs.push(`E${row.number}`);
      }
    }

    const totalRow = sheet.addRow(["", "", "", "ИТОГО к выплате", 0]);
    totalRow.font = { bold: true };
    const totalCell = totalRow.getCell(5);
    totalCell.value = amountCellRefs.length ? { formula: `SUM(${amountCellRefs.join(",")})`, result: 0 } : 0;
    totalCell.numFmt = "#,##0";
    payoutCellRefs.push(`E${totalRow.number}`);

    sheet.addRow([]);
  }

  sheet.addRow([]);
  const grandRow = sheet.addRow(["", "", "", "ИТОГО НА РУКИ (все сотрудники)", 0]);
  grandRow.font = { bold: true, size: 12 };
  const grandCell = grandRow.getCell(5);
  grandCell.value = payoutCellRefs.length ? { formula: `SUM(${payoutCellRefs.join(",")})`, result: 0 } : 0;
  grandCell.numFmt = "#,##0";

  const ndflRow = sheet.addRow(["", "", "", "НДФЛ 13% (сверху)", 0]);
  const ndflCell = ndflRow.getCell(5);
  ndflCell.value = { formula: `ROUND(E${grandRow.number}*13/87,0)`, result: 0 };
  ndflCell.numFmt = "#,##0";

  const grossRow = sheet.addRow(["", "", "", "ИТОГО + НДФЛ", 0]);
  grossRow.font = { bold: true, size: 12 };
  const grossCell = grossRow.getCell(5);
  grossCell.value = { formula: `E${grandRow.number}+E${ndflRow.number}`, result: 0 };
  grossCell.numFmt = "#,##0";

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `зарплата-${generatedAt.toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
