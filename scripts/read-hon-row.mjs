import { readFileSync } from "fs";
import { google } from "googleapis";

function loadEnv(p) {
  const t = readFileSync(p, "utf8");
  const o = {};
  for (const l of t.split("\n")) {
    const e = l.trim();
    if (!e || e.startsWith("#")) continue;
    const i = e.indexOf("=");
    if (i < 0) continue;
    let v = e.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[e.slice(0, i).trim()] = v;
  }
  return o;
}

const env = loadEnv(".env.local");
const auth = new google.auth.JWT({
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const res = await sheets.spreadsheets.values.get({
  spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
  range: "PaperTrades!A14:Z14",
});
const row = res.data.values?.[0] ?? [];
console.log("Row 14 columns:");
row.forEach((v, i) => {
  const col = i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`;
  console.log(`  ${col} [${i}]: ${JSON.stringify(v)}`);
});
