/**
 * Correctif appliqué après `opennextjs-cloudflare build`.
 *
 * @opennextjs/aws importe le module « cookie » par défaut (`import cookieParser from "cookie"`), mais
 * cookie 1.x n'a pas d'export par défaut : une fois compilé, `import_cookie.default` est undefined
 * et TOUTE requête portant un témoin (session, langue…) plante avec
 * « Cannot read properties of undefined (reading 'parse') ».
 * Le correctif remplace `import_cookie.default.parse` par une version qui retombe sur le module lui-même.
 * Sans effet si une future version d'OpenNext corrige le problème (motif introuvable).
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", ".open-next");
const PATTERN = /\b(import_cookie\d*)\.default\.(parse|serialize)\b/g;

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(m?js)$/.test(entry.name)) yield full;
  }
}

if (!fs.existsSync(ROOT)) {
  console.error("patch-open-next : dossier .open-next introuvable (lancer d'abord la compilation).");
  process.exit(1);
}

let patched = 0;
for (const file of files(ROOT)) {
  const source = fs.readFileSync(file, "utf8");
  if (!PATTERN.test(source)) continue;
  PATTERN.lastIndex = 0;
  const fixed = source.replace(PATTERN, (_m, mod, fn) => `(${mod}.default ?? ${mod}).${fn}`);
  fs.writeFileSync(file, fixed);
  patched++;
  console.log(`patch-open-next : ${path.relative(ROOT, file)} corrigé`);
}
if (patched === 0) console.log("patch-open-next : rien à corriger.");
