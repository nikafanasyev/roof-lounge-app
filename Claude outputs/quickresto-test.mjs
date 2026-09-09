// Тестовый скрипт для проверки интеграции с Quick Resto (без сохранения пароля в коде).
//
// Запуск (в терминале, на своей машине, где есть доступ к интернету):
//
//   QR_LOGIN='...' QR_PASSWORD='...' node quickresto-test.mjs
//
// Требуется Node.js 18+ (использует встроенный модуль https, без npm install).
//
// Что делает:
//   1. Логинится в бэк-офис hu554.quickresto.ru через j_spring_security_check.
//   2. Получает список сотрудников (personnel.employee/select) — id, ПИН, telegramId.
//   3. Для каждого сотрудника с ПИН-кодом запрашивает его смены за текущий период
//      (personnel.salary.workshift_statement/select) и печатает последнюю смену,
//      помечая её как ОТКРЫТА, если startTime === endTime (это и есть признак
//      незакрытой смены — Quick Resto дублирует startTime в endTime, пока
//      сотрудник не завершил смену на терминале).

import https from "node:https";

const HOST = "hu554.quickresto.ru";
const QR_LOGIN = process.env.QR_LOGIN;
const QR_PASSWORD = process.env.QR_PASSWORD;

if (!QR_LOGIN || !QR_PASSWORD) {
  console.error("Задайте переменные окружения QR_LOGIN и QR_PASSWORD перед запуском.");
  process.exit(1);
}

const cookies = new Map();

function storeCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;
  for (const raw of setCookieHeaders) {
    const pair = raw.split(";")[0];
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function request(method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: HOST,
        path,
        method,
        headers: {
          Accept: "application/json, text/plain, */*",
          ...headers,
          Cookie: cookieHeader(),
        },
      },
      (res) => {
        storeCookies(res.headers["set-cookie"]);
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function login() {
  const body = new URLSearchParams({
    j_username: QR_LOGIN,
    j_password: QR_PASSWORD,
    j_rememberme: "true",
  }).toString();
  const res = await request("POST", "/platform/j_spring_security_check", {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
  });
  if (res.status >= 400) {
    throw new Error(`Логин не удался: HTTP ${res.status} — ${res.body.slice(0, 300)}`);
  }
  console.log(`Логин выполнен (HTTP ${res.status}).`);
}

async function getEmployees() {
  const res = await request(
    "GET",
    "/platform/data/personnel.employee/select?start=0&count=150&groupField%5B%5D=role&groupDir%5B%5D=asc&businessDayOffsetInMs=43200000&timeZone=-180",
  );
  if (res.status >= 400) {
    throw new Error(`Не удалось получить список сотрудников: HTTP ${res.status} — ${res.body.slice(0, 300)}`);
  }
  return JSON.parse(res.body);
}

async function getWorkshifts(employeeId) {
  const res = await request(
    "GET",
    `/platform/data/personnel.salary.workshift_statement/select?start=0&count=150&mode=currentPeriod&ownerContextId=${employeeId}&ownerContextClassName=ru.edgex.quickresto.modules.personnel.employee.Employee&businessDayOffsetInMs=43200000&timeZone=-180`,
  );
  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status} — ${res.body.slice(0, 300)}`);
  }
  return JSON.parse(res.body);
}

function fmt(ms) {
  return new Date(ms).toLocaleString("ru-RU");
}

async function main() {
  await login();

  const employeesResp = await getEmployees();
  const employees = (employeesResp.ds ?? []).map((d) => d.object);
  console.log(`\nСотрудников найдено: ${employees.length}`);

  for (const emp of employees) {
    if (!emp.pin) continue; // пропускаем служебные записи без ПИНа
    const name = `${emp.lastName ?? ""} ${emp.firstName ?? ""}`.trim() || emp.title || `id=${emp.id}`;
    console.log(`\n— ${name} (id=${emp.id}, pin=${emp.pin}, telegramId=${emp.telegramId || "—"})`);

    try {
      const shiftsResp = await getWorkshifts(emp.id);
      const shifts = (shiftsResp.ds ?? []).map((d) => d.object);
      const last = shifts[shifts.length - 1];
      if (!last) {
        console.log("  смен в текущем расчётном периоде нет");
        continue;
      }
      const isOpen = last.startTime === last.endTime;
      console.log(
        `  последняя смена: начало ${fmt(last.startTime)}, конец ${fmt(last.endTime)} — ${
          isOpen ? "ОТКРЫТА ПРЯМО СЕЙЧАС" : "закрыта"
        }`,
      );
    } catch (err) {
      console.log("  ошибка получения смен:", err.message);
    }
  }
}

main().catch((err) => {
  console.error("\nОшибка:", err.message);
  process.exit(1);
});
