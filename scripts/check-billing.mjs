// ponytail: cek murah untuk matematika biaya (tanpa framework).
// Jalankan: node scripts/check-billing.mjs
import assert from "node:assert/strict";

const countTokens = (t) => Math.ceil(t.length / 4);
const units = (base, u = 1) => Math.max(1, Math.ceil(base * u));
const streamCost = (chars, per1k, reply = "") =>
  Math.ceil(((countTokens(reply) + (chars > 0 ? countTokens("x".repeat(chars)) : 0)) / 1000) * per1k);

assert.equal(units(3, 2), 6, "2 gambar = 2x biaya");
assert.equal(units(1, 0), 1, "minimal 1 Token");
assert.equal(units(5, 1), 5, "video t2v tidak berubah");

assert.equal(streamCost(4000, 1), 1, "4k char input ~1k token = 1 Token");
assert.equal(streamCost(40000, 1), 10, "PDF 40k char = 10 Token (bukan 1)");
assert.equal(streamCost(0, 1, "a".repeat(4000)), 1, "tanpa input, bayar jawaban saja");
assert.ok(streamCost(40000, 1, "a".repeat(8000)) > streamCost(0, 1, "a".repeat(8000)), "input menambah biaya");

console.log("billing math OK");
