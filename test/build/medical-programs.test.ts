import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScoreKey } from "../../src/shared/types.ts";
import { buildBrowse } from "../../src/build/browse.ts";
import { medicalPrograms } from "../../src/build/medical-programs.ts";
import { buildProgramExams } from "../../src/build/program-exams.ts";

const SCORE_KEYS: ScoreKey[] = ["tpat11", "a_lv_61", "a_lv_64", "a_lv_65", "a_lv_66"]
  .map(k => ({ key: k, label: k, max_value: 100, short_label: k, exam_subjects: [k] }));

// รูปแบบเดียวกับไฟล์จริง (ตัดคอลัมน์ที่ไม่ใช้ออกบางส่วน) — text6 มี , ใน "..." และ scores เป็น JSON ที่มี ""
const CSV = `text6,admission_round,admission_year,campus_name,faculty_name,min_score_last_year,program_id,program_name,program_type_name,project_id,scores,university_id,adt_ts,row_hash
"[{x, text}]",3,2569,วิทยาเขตหลัก,คณะทันตแพทยศาสตร์ ม.ทดสอบ,12.3,P1,เภสัชศาสตรบัณฑิต (ภ.บ.),ภาษาไทย ปกติ,null,"{""tpat11"":30,""a_lv_61"":40,""cal_score_sum"":30,""cal_subject_name"":""a_lv_64 a_lv_65 a_lv_66""}",031,2026-11-08T01:06:42.209Z,abc
`;

test("กสพท CSV → browse row with field from the name, cal_subject_name split, ly: true, round 3 scored", () => {
  const { programs, rounds } = medicalPrograms(CSV);
  const exams = buildProgramExams(rounds, SCORE_KEYS);
  const browse = buildBrowse(programs, exams, SCORE_KEYS, [], rounds, [], ["P1"]);
  assert.deepEqual(browse.programs, [{
    id: "P1", name: "เภสัชศาสตรบัณฑิต (ภ.บ.)", type: "ภาษาไทย ปกติ", uni: "031", group: "13", field: "13-01",
    campus: "วิทยาเขตหลัก", faculty: "คณะทันตแพทยศาสตร์ ม.ทดสอบ",
    exams: { tpat11: 30, a_lv_61: 40, a_lv_64: 10, a_lv_65: 10, a_lv_66: 10 }, others: {}, either: [],
    rounds: [3], scored: [3], ly: true,
  }]);
  assert.deepEqual(browse.fields, { "13-01": "เภสัชศาสตร์" });
  assert.doesNotMatch(JSON.stringify(browse), /12\.3|abc|2026-11-08/); // min_score_last_year, row_hash, adt_ts
});
