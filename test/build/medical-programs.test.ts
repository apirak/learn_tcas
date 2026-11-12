import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScoreKey, University } from "../../src/shared/types.ts";
import { buildBrowse } from "../../src/build/browse.ts";
import { medicalPrograms, parseCsv } from "../../src/build/medical-programs.ts";
import { buildProgramExams } from "../../src/build/program-exams.ts";

const SCORE_KEYS: ScoreKey[] = ["tpat11", "a_lv_61", "a_lv_64", "a_lv_65", "a_lv_66"]
  .map(k => ({ key: k, label: k, max_value: 100, short_label: k, exam_subjects: [k] }));

const UNIVERSITIES: University[] = [
  { university_id: "009", university_name: "มหาวิทยาลัยทดสอบ" },
  { university_id: "031", university_name: "กลุ่มสถาบันแพทยศาสตร์แห่งประเทศไทย" },
];

// รูปแบบเดียวกับไฟล์จริง (ตัดคอลัมน์ที่ไม่ใช้ออกบางส่วน) — text6 มี , ใน "..." และ scores เป็น JSON ที่มี ""
const CSV = `text6,admission_round,admission_year,campus_name,faculty_name,min_score_last_year,program_id,program_name,program_type_name,project_id,scores,university_id,adt_ts,row_hash
"[{x, text}]",3,2569,วิทยาเขตหลัก,คณะเภสัชศาสตร์ มหาวิทยาลัยทดสอบ (สาขาวิชาการบริบาลทางเภสัชกรรม),12.3,P1,เภสัชศาสตรบัณฑิต (ภ.บ.),ภาษาไทย ปกติ,null,"{""tpat11"":30,""a_lv_61"":40,""cal_score_sum"":30,""cal_subject_name"":""a_lv_64 a_lv_65 a_lv_66""}",031,2026-11-08T01:06:42.209Z,abc
x,3,2569,วิทยาเขตหลัก,คณะทันตแพทยศาสตร์ มหาวิทยาลัยทดสอบธนบุรี (สถาบันเอกชน),1,P2,ทันตแพทยศาสตรบัณฑิต,ภาษาไทย ปกติ,null,"{""tpat11"":100}",31,t,h
x,3,2569,วิทยาเขตหลัก,วิทยาลัยแพทยศาสตร์พระมงกุฎเกล้า (กองทัพบก),1,P3,แพทยศาสตรบัณฑิต,ภาษาไทย ปกติ,null,"{""tpat11"":100}",031,t,h
`;

test("กสพท CSV → browse rows under the university named in faculty_name (else 031), field from the program name, ly: true, round 3 scored", () => {
  const { programs, rounds, unmatched } = medicalPrograms(CSV, UNIVERSITIES);
  assert.equal(unmatched, 2);
  const exams = buildProgramExams(rounds, SCORE_KEYS);
  const browse = buildBrowse(programs, exams, SCORE_KEYS, [], rounds, [], ["P1", "P2", "P3"]);
  assert.deepEqual(browse.programs, [{
    // ชื่อมหาวิทยาลัยอยู่ใน faculty_name → ใช้รหัสมหาวิทยาลัยจริง
    id: "P1", name: "เภสัชศาสตรบัณฑิต (ภ.บ.)", type: "ภาษาไทย ปกติ", uni: "009", group: "13", field: "13-01",
    campus: "วิทยาเขตหลัก", faculty: "คณะเภสัชศาสตร์ มหาวิทยาลัยทดสอบ (สาขาวิชาการบริบาลทางเภสัชกรรม)",
    exams: { tpat11: 30, a_lv_61: 40, a_lv_64: 10, a_lv_65: 10, a_lv_66: 10 }, others: {}, either: [],
    rounds: [3], scored: [3], ly: true,
  }, {
    // "มหาวิทยาลัยทดสอบ" เป็นแค่ต้นชื่อ "มหาวิทยาลัยทดสอบธนบุรี" (เหมือน กรุงเทพ / กรุงเทพธนบุรี) → คงไว้ที่ 031
    id: "P2", name: "ทันตแพทยศาสตรบัณฑิต", type: "ภาษาไทย ปกติ", uni: "031", group: "12", field: "12-01",
    campus: "วิทยาเขตหลัก", faculty: "คณะทันตแพทยศาสตร์ มหาวิทยาลัยทดสอบธนบุรี (สถาบันเอกชน)",
    exams: { tpat11: 100 }, others: {}, either: [],
    rounds: [3], scored: [3], ly: true,
  }, {
    // ไม่มีชื่อมหาวิทยาลัยเลย → 031
    id: "P3", name: "แพทยศาสตรบัณฑิต", type: "ภาษาไทย ปกติ", uni: "031", group: "10", field: "10-01",
    campus: "วิทยาเขตหลัก", faculty: "วิทยาลัยแพทยศาสตร์พระมงกุฎเกล้า (กองทัพบก)",
    exams: { tpat11: 100 }, others: {}, either: [],
    rounds: [3], scored: [3], ly: true,
  }]);
  assert.deepEqual(browse.fields, { "13-01": "เภสัชศาสตร์", "12-01": "ทันตแพทยศาสตร์", "10-01": "แพทยศาสตร์" });
  assert.doesNotMatch(JSON.stringify(browse), /12\.3|abc|2026-11-08/); // min_score_last_year, row_hash, adt_ts
});

test("parseCsv strips an Excel BOM and skips blank lines", () => {
  assert.deepEqual(parseCsv("﻿program_id,x\r\nP1,a\r\n\r\nP2,b\r\n\r\n"), [
    { program_id: "P1", x: "a" },
    { program_id: "P2", x: "b" },
  ]);
});
