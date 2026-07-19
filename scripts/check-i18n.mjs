// Build-time i18n guard.
//
// Scans every `useTranslations`/`getTranslations` call in src/ and verifies that
// each *literal* message key it references exists in ALL locale files. next-intl
// throws on a missing key at runtime (which crashed Projects/Insights/Accounts in
// prod once), so we catch it here and fail the build instead.
//
// Limitations (by design): only statically-analyzable literal keys are checked.
// Dynamic keys like t(`statuses.${x}`) or t(someVar) can't be verified statically
// and are covered by the runtime getMessageFallback safety net instead.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const MESSAGES_DIR = path.join(SRC, "messages");

// ---- load locales ------------------------------------------------------------
const localeFiles = fs.readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));
const locales = {};
for (const f of localeFiles) {
  const raw = fs.readFileSync(path.join(MESSAGES_DIR, f), "utf8").replace(/^﻿/, "");
  locales[f.replace(/\.json$/, "")] = JSON.parse(raw);
}
const localeNames = Object.keys(locales);

function hasKey(obj, dotted) {
  let cur = obj;
  for (const seg of dotted.split(".")) {
    if (cur && typeof cur === "object" && seg in cur) cur = cur[seg];
    else return false;
  }
  return typeof cur === "string"; // must resolve to a leaf string
}

// ---- walk source files -------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(t|j)sx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const problems = [];

// const t = useTranslations("ns")  |  const t = await getTranslations("ns")  |  useTranslations()
const declRe =
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g;

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");

  // map translation-fn variable -> namespace ("" = root)
  const varNs = new Map();
  let m;
  while ((m = declRe.exec(src)) !== null) {
    varNs.set(m[1], m[2] ?? "");
  }
  if (varNs.size === 0) continue;

  const lines = src.split("\n");
  for (const [varName, ns] of varNs) {
    // <var>("literal"  or  <var>.rich("literal"  /.raw/.markup — NOT preceded by an identifier char
    const callRe = new RegExp(
      `(?<![A-Za-z0-9_$.])${varName}(?:\\.(?:rich|raw|markup))?\\(\\s*["'\`]([A-Za-z0-9_.]+)["'\`]`,
      "g"
    );
    for (let i = 0; i < lines.length; i++) {
      let c;
      while ((c = callRe.exec(lines[i])) !== null) {
        const key = c[1];
        const full = ns ? `${ns}.${key}` : key;
        const missingIn = localeNames.filter((loc) => !hasKey(locales[loc], full));
        if (missingIn.length > 0) {
          problems.push({ full, file: path.relative(ROOT, file), line: i + 1, missingIn });
        }
      }
    }
  }
}

// ---- report ------------------------------------------------------------------
if (problems.length === 0) {
  console.log(`✓ i18n: all referenced message keys exist in ${localeNames.join(", ")}`);
  process.exit(0);
}

console.error(`\n✗ i18n check failed — ${problems.length} missing message key(s):\n`);
for (const p of problems.sort((a, b) => a.full.localeCompare(b.full))) {
  console.error(`  ${p.full}`);
  console.error(`      ${p.file}:${p.line}  (missing in: ${p.missingIn.join(", ")})`);
}
console.error(`\nAdd the key(s) to src/messages/<locale>.json for every locale, then rebuild.\n`);
process.exit(1);
