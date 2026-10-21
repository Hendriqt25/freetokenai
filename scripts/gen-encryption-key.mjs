// Bangkitkan APP_ENCRYPTION_KEY (32 byte -> 64 hex) untuk enkripsi API key di DB.
// Pakai: npm run gen:key          -> tulis/-update di .env.local otomatis.
//        npm run gen:key -- --show -> cukup tampilkan, jangan tulis file.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const key = randomBytes(32).toString("hex");
const showOnly = process.argv.includes("--show");

if (showOnly) {
  console.log(key);
  process.exit(0);
}

const file = ".env.local";
let content = "";
try {
  content = readFileSync(file, "utf8");
} catch {
  // file belum ada -> mulai kosong
}

if (/^APP_ENCRYPTION_KEY=.*$/m.test(content)) {
  content = content.replace(/^APP_ENCRYPTION_KEY=.*$/m, `APP_ENCRYPTION_KEY=${key}`);
} else {
  content = content.trimEnd() + (content.trim() ? "\n" : "") + `APP_ENCRYPTION_KEY=${key}\n`;
}
writeFileSync(file, content, "utf8");
console.log(`APP_ENCRYPTION_KEY baru ditulis ke ${file}`);
console.log("Restart server dev agar env terbaca ulang.");
