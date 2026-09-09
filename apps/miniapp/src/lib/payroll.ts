import type { SalaryModel } from "@/types";

/** Начисление за смену по модели ЗП сотрудника и выручке этой смены — единая
 * формула, чтобы зарплата всегда считалась из выручки, а не проставлялась
 * вручную по каждой смене отдельно. Вынесено отдельно от data/repo.ts, чтобы
 * им мог пользоваться и seed.ts (заготовка данных), не создавая цикл импортов
 * seed.ts -> repo.ts -> seed.ts. */
export function computeShiftSalary(salaryModel: SalaryModel, revenue: number): number {
  if (salaryModel.type === "fixed") return salaryModel.value;
  if (salaryModel.type === "percent") return Math.round((revenue * salaryModel.value) / 100);
  return Math.round(salaryModel.base + (revenue * salaryModel.percent) / 100);
}
