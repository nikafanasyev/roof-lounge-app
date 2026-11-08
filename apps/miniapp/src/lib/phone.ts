// Маска ввода телефона вида "+7 999 123-45-67" — раньше поле просто
// принимало то, что напечатали, сплошной строкой цифр (см. обсуждение с
// Никитой: "вводится просто сплошным текстом. Некрасиво"). Форматируем по
// мере ввода, а не только при сохранении (normalizePhone в data/repo.ts
// всё равно сначала снова разбирает на цифры — им всё равно, в каком виде
// строка пришла).
export function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits[0] === "8") digits = "7" + digits.slice(1);
  if (digits[0] !== "7") digits = "7" + digits;
  digits = digits.slice(0, 11);
  const rest = digits.slice(1);
  let out = "+7";
  if (rest.length > 0) out += " " + rest.slice(0, 3);
  if (rest.length > 3) out += " " + rest.slice(3, 6);
  if (rest.length > 6) out += "-" + rest.slice(6, 8);
  if (rest.length > 8) out += "-" + rest.slice(8, 10);
  return out;
}
