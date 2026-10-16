/** Exercises HDSS parsing with synthetic identities, source conflicts, and malformed CSV. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeHdssRegistryCursor,
  encodeHdssRegistryCursor,
  parseHdssRegistryCsv,
} from "./blbRegistry";

const header = [
  "hdss_unique_id",
  "village_code",
  "village_name",
  "phc_code",
  "phc_name",
  "name",
  "age",
  "sex",
  "house_no",
  "family_no",
  "ind_no",
  "domicile",
  "curr_status",
  "death_date",
  "migrated_out_date",
  "migration_reason",
].join(",");

test("parses source text, preserves leading zeroes, and derives status from domicile", () => {
  const source = [
    header,
    "TEST-HDSS-000001,001,Village,02,PHC,Alpha,7,1,0004,03,01,Resident, D,,,",
    "TEST-HDSS-00000!,001,Village,02,PHC,, ,2,0004,03,01,Dead,L,,2020-01-02,",
  ].join("\n");
  const result = parseHdssRegistryCsv(source);

  assert.deepEqual(result.issues, []);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].uid, "TEST-HDSS-000001");
  assert.equal(result.rows[0].hh_list_no, "0004");
  assert.equal(result.rows[0].sex, "1");
  assert.equal(result.rows[0].status, "alive");
  assert.equal(result.rows[0].curr_status, " D");
  assert.equal(result.rows[1].uid, "TEST-HDSS-00000!");
  assert.equal(result.rows[1].name, null);
  assert.equal(result.rows[1].age_years, null);
  assert.equal(result.rows[1].status, "dead");
  assert.equal(result.rows[1].source_age_as_of, "2026-10-14");
});

test("round-trips opaque cursor generation and scope hash", () => {
  const encoded = encodeHdssRegistryCursor({
    uid: "TEST-HDSS-00000!",
    generation: "generation-1",
    scope_hash: "a".repeat(64),
  });
  assert.deepEqual(decodeHdssRegistryCursor(encoded), {
    uid: "TEST-HDSS-00000!",
    generation: "generation-1",
    scope_hash: "a".repeat(64),
  });
  assert.equal(decodeHdssRegistryCursor("not-a-cursor"), null);
  assert.equal(decodeHdssRegistryCursor(""), null);
});

test("retains duplicate household tuples when person IDs differ", () => {
  const row = "TEST-HDSS-000001,001,Village,02,PHC,Alpha,7,1,0004,03,01,Resident,L,,,";
  const result = parseHdssRegistryCsv(
    header + "\n" + row + "\nTEST-HDSS-00000!,001,Village,02,PHC,Beta,8,2,0004,03,01,Emigrated,L,,,moved",
  );

  assert.deepEqual(result.issues, []);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].hh_list_no, result.rows[1].hh_list_no);
  assert.equal(result.rows[0].status, "alive");
  assert.equal(result.rows[1].status, "emigrated");
});

test("preserves source whitespace in names and household identifiers", () => {
  const result = parseHdssRegistryCsv(`${header}\nTEST-HDSS-000003,001,Village,02,PHC, Alpha ,7,1, 0004 ,03,01,Resident,L ,,,`);
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows[0].name, " Alpha ");
  assert.equal(result.rows[0].hh_list_no, " 0004 ");
  assert.equal(result.rows[0].curr_status, "L ");
});

test("rejects duplicate IDs and missing source columns before import", () => {
  const duplicate = "TEST-HDSS-000001,001,Village,02,PHC,Alpha,7,1,0004,03,01,Resident,L,,,";
  const result = parseHdssRegistryCsv(header + "\n" + duplicate + "\n" + duplicate);

  assert.equal(result.rows.length, 0);
  assert.ok(result.issues.some((issue) => issue.code === "duplicate_uid"));

  const missing = parseHdssRegistryCsv("hdss_unique_id,village_code\nTEST-HDSS-000001,001");
  assert.equal(missing.rows.length, 0);
  assert.ok(missing.issues.some((issue) => issue.code === "missing_column" && issue.column === "domicile"));
});

test("rejects malformed quoting without returning source content", () => {
  const malformed = parseHdssRegistryCsv(header + "\nTEST-HDSS-000001,001,\"Village,02,PHC");
  assert.equal(malformed.rows.length, 0);
  assert.ok(malformed.issues.some((issue) => issue.code === "malformed_csv"));
  assert.equal(JSON.stringify(malformed.issues).includes("Village"), false);
  const invalidEmbeddedQuote = parseHdssRegistryCsv(header + '\nTEST-HDSS-000001,001,Vi"ll"age,02,PHC,Alpha,7,1,0004,03,01,Resident,L,,,');
  assert.ok(invalidEmbeddedQuote.issues.some((issue) => issue.code === "malformed_csv"));
});

test("accepts quoted final cells followed by another record and rejects empty data records", () => {
  const first = 'TEST-HDSS-000001,001,Village,02,PHC,"Alpha, Beta",7,1,0004,03,01,Resident,L,,,"reason, quoted"';
  const second = 'TEST-HDSS-000002,001,Village,02,PHC,Beta,8,2,0004,03,02,Resident,L,,,';
  const result = parseHdssRegistryCsv(`${header}\n${first}\n${second}`);
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].name, "Alpha, Beta");
  assert.equal(result.rows[0].migration_reason, "reason, quoted");
  const empty = parseHdssRegistryCsv(`${header}\n${Array(16).fill("").join(",")}`);
  assert.ok(empty.issues.some((issue) => issue.code === "missing_uid"));
});

test("allows blank names and identifiers but rejects unknown domicile and sex", () => {
  const blankCells = Array(16).fill("");
  blankCells[0] = "TEST-HDSS-000001";
  blankCells[7] = "2";
  blankCells[11] = "Visitor";
  const blank = blankCells.join(",");
  const valid = parseHdssRegistryCsv(header + "\n" + blank);
  assert.deepEqual(valid.issues, []);
  assert.equal(valid.rows[0].name, null);
  assert.equal(valid.rows[0].hh_list_no, null);
  assert.equal(valid.rows[0].status, "alive");

  const badCells = [...blankCells];
  badCells[7] = "3";
  badCells[11] = "Unknown";
  const badDomicile = parseHdssRegistryCsv(header + "\n" + badCells.join(","));
  assert.ok(badDomicile.issues.some((issue) => issue.code === "invalid_sex"));

  badCells[7] = "1";
  const unknownDomicile = parseHdssRegistryCsv(header + "\n" + badCells.join(","));
  assert.ok(unknownDomicile.issues.some((issue) => issue.code === "invalid_domicile"));
});
