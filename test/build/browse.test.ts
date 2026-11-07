import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdmissionRound, Program, ProgramExam, ScoreKey, University } from "../../src/shared/types.ts";
import { buildBrowse, eitherByProgram, examWeightsByProgram, otherWeightsByProgram, roundsByProgram, subjectsOfKey } from "../../src/build/browse.ts";

const key = (k: string, exam_subjects: string[]): ScoreKey =>
  ({ key: k, label: `ชื่อ ${k}`, max_value: 100, short_label: k, exam_subjects });
const SCORE_KEYS = [
  key("tgat", ["tgat1", "tgat2", "tgat3"]),
  key("tgat1", ["tgat1"]), key("tgat2", ["tgat2"]), key("tgat3", ["tgat3"]),
  key("a_lv_64", ["a_lv_64"]), key("a_lv_65", ["a_lv_65"]), key("a_lv_82", ["a_lv_82"]),
  key("tpat1", []), key("gpax", []), key("portfolio", []),
  { ...key("ielts", []), short_label: "IELTS " }, key("toeic", []),
];
const KEY_MAP = new Map(SCORE_KEYS.map(k => [k.key, k]));

const exam = (
  program_id: string, components: ProgramExam["components"], min_scores = {}, min_score_group: ProgramExam["min_score_group"] = null, round = 1,
): ProgramExam => ({
  program_id, university_id: "001", round, project_id: null, project_name_th: null,
  receive_student_number: null, min_total_score: null, components, min_scores, min_score_group,
});

test("subjectsOfKey maps a score key to the actual exam subjects", () => {
  assert.deepEqual(subjectsOfKey("tgat", KEY_MAP), ["tgat1", "tgat2", "tgat3"]);
  assert.deepEqual(subjectsOfKey("a_lv_82_tscore", KEY_MAP), ["a_lv_82"]);
  assert.deepEqual(subjectsOfKey("tpat1", KEY_MAP), ["tpat1"]); // no blueprint page
  assert.deepEqual(subjectsOfKey("ielts", KEY_MAP), ["ielts"]); // not in the dictionary
  for (const k of ["gpax", "gpa22", "portfolio", "interview", "priority_score"]) assert.deepEqual(subjectsOfKey(k, KEY_MAP), []);
});

test("weights: expands tgat, keeps the max across rounds, min-score only = 0", () => {
  const weights = examWeightsByProgram([
    exam("P1", [{ key: "tgat", weight: 20 }, { key: "a_lv_64", weight: 10 }], { a_lv_65: 30, gpax: 2 }),
    exam("P1", [{ key: "a_lv_64", weight: 40 }]),
    exam("P1", [{ key: "tgat1", weight: 5 }], { tgat2: 50 }), // lower than before → not overwritten
  ], KEY_MAP);
  assert.deepEqual(weights.get("P1"), { tgat1: 20, tgat2: 20, tgat3: 20, a_lv_64: 40, a_lv_65: 0 });
});

test("choose_one_of: an option summing several subjects splits the weight evenly (round half up)", () => {
  const weights = examWeightsByProgram([
    exam("P1", [{ key: null, weight: 25, choose_one_of: [["a_lv_82"], ["a_lv_64", "a_lv_65"]] }]),
    exam("P2", [{ key: null, weight: 1, choose_one_of: [["a_lv_64", "a_lv_65"]] }]),
  ], KEY_MAP);
  assert.deepEqual(weights.get("P1"), { a_lv_82: 25, a_lv_64: 13, a_lv_65: 13 });
  assert.deepEqual(weights.get("P2"), { a_lv_64: 1, a_lv_65: 1 }); // 0.5 → 1, not 0 (0 means min-score only)
});

test("min score group: sum = every subject is required (weight 0), any = goes to either instead", () => {
  const weights = examWeightsByProgram([
    exam("P1", [], {}, { rule: "sum", keys: ["a_lv_64", "a_lv_65", "gpa22"], minimum: "250" }),
    exam("P2", [], { ielts: 5.5, toeic: 600, a_lv_82: 30 }, { rule: "any", keys: ["ielts", "toeic"], minimum: "5.5 600" }),
  ], KEY_MAP);
  assert.deepEqual(weights.get("P1"), { a_lv_64: 0, a_lv_65: 0 });
  assert.deepEqual(weights.get("P2"), { a_lv_82: 0 }); // ielts/toeic = choose one → not required
  assert.deepEqual(examWeightsByProgram([exam("P3", [], {}, { rule: "any", keys: ["a_lv_64"], minimum: "30" })], KEY_MAP).get("P3"), { a_lv_64: 0 });
});

test("either: any-of groups deduped across rounds, _tscore stripped, grade-only groups dropped", () => {
  const either = eitherByProgram([
    exam("P1", [], {}, { rule: "any", keys: ["ielts", "toeic"], minimum: "5.5 600" }),
    exam("P1", [], {}, { rule: "any", keys: ["ielts", "toeic"], minimum: "6 700" }, 2),
    exam("P1", [], {}, { rule: "any", keys: ["a_lv_64_tscore", "a_lv_65"], minimum: "30" }, 3),
    exam("P2", [], {}, { rule: "any", keys: ["gpa22", "gpa23"], minimum: "3" }),
    exam("P4", [], {}, { rule: "any", keys: ["tgat"], minimum: "30" }), // one subject = plain minimum
    exam("P3", [], {}, { rule: "sum", keys: ["a_lv_64", "a_lv_65"], minimum: "100" }),
  ], KEY_MAP);
  assert.deepEqual(either.get("P1"), [["ielts", "toeic"], ["a_lv_64", "a_lv_65"]]);
  assert.equal(either.has("P2"), false);
  assert.equal(either.has("P3"), false);
  assert.equal(either.has("P4"), false);
});

test("rounds: every round on mytcas vs rounds that published score weights", () => {
  const ar = (program_id: string, round: number) => ({ program_id, round }) as AdmissionRound;
  const rounds = roundsByProgram([ar("P1", 3), ar("P1", 1), ar("P1", 1), ar("P2", 2)], [
    exam("P1", [{ key: "tgat", weight: 100 }], {}, null, 3),
    exam("P2", [], { tgat: 30 }, null, 2), // minimum only → not scored
  ]);
  assert.deepEqual([rounds.open("P1"), rounds.scored("P1")], [[1, 3], [3]]);
  assert.deepEqual([rounds.open("P2"), rounds.scored("P2")], [[2], []]);
  assert.deepEqual(rounds.open("P9"), []);
});

test("others: non-exam criteria with a real weight, max across rounds; min-score only is skipped", () => {
  const others = otherWeightsByProgram([
    exam("P1", [{ key: "gpax", weight: 100 }]),
    exam("P1", [{ key: "gpax", weight: 40 }, { key: "portfolio", weight: 60 }, { key: "a_lv_64", weight: 0 }], { gpax: 2 }),
    exam("P2", [{ key: "tgat", weight: 100 }], { gpax: 3 }),
  ], KEY_MAP);
  assert.deepEqual(others.get("P1"), { gpax: 100, portfolio: 60 });
  assert.equal(others.has("P2"), false);
});

test("buildBrowse: one row per program_id, no exams = empty exams, gpax-only goes to others, subjects sorted by key", () => {
  const program = (program_id: string, major: string, campus = "วิทยาเขตหลัก", faculty = "คณะวิศวกรรมศาสตร์"): Program => ({
    program_id, program_name_th: `หลักสูตร ${program_id}`, program_type_name_th: "ไทย (ปกติ)", university_id: "001",
    group_field_id: "30", group_field_th: "วิศวกรรมศาสตร์", field_id: "00", field_name_th: "วิศวกรรมทั่วไป",
    campus_name_th: campus, faculty_name_th: faculty, major,
  });
  const universities: University[] = [{ university_id: "001", university_name: "มหาวิทยาลัย ก" }];
  const browse = buildBrowse(
    [program("P1", "เอก 1"), program("P1", "เอก 2", "วิทยาเขตอื่น", "คณะอื่น"), program("P2", "", "วิทยาเขต 2", "คณะ 2")],
    [
      exam("P1", [{ key: "tgat", weight: 50 }, { key: "a_lv_64", weight: 50 }], {}, null, 3),
      exam("P2", [{ key: "gpax", weight: 100 }], {}, { rule: "any", keys: ["ielts", "toeic"], minimum: "5.5 600" }, 2),
    ],
    SCORE_KEYS,
    universities,
    [{ program_id: "P1", round: 1 }, { program_id: "P1", round: 3 }, { program_id: "P2", round: 2 }] as AdmissionRound[],
  );
  assert.deepEqual(browse, {
    groups: { "30": "วิศวกรรมศาสตร์" },
    fields: { "30-00": "วิศวกรรมทั่วไป" },
    universities: { "001": "มหาวิทยาลัย ก" },
    subjects: { a_lv_64: "ชื่อ a_lv_64", gpax: "ชื่อ gpax", ielts: "ชื่อ ielts", tgat1: "ชื่อ tgat1", tgat2: "ชื่อ tgat2", tgat3: "ชื่อ tgat3", toeic: "ชื่อ toeic" },
    short: { ielts: "IELTS", toeic: "toeic" },
    programs: [
      { id: "P1", name: "หลักสูตร P1", type: "ไทย (ปกติ)", uni: "001", group: "30", field: "30-00",
        campus: "วิทยาเขตหลัก", faculty: "คณะวิศวกรรมศาสตร์", // first row of P1 wins
        exams: { tgat1: 50, tgat2: 50, tgat3: 50, a_lv_64: 50 }, others: {}, either: [], rounds: [1, 3], scored: [3] },
      { id: "P2", name: "หลักสูตร P2", type: "ไทย (ปกติ)", uni: "001", group: "30", field: "30-00",
        campus: "วิทยาเขต 2", faculty: "คณะ 2", exams: {}, others: { gpax: 100 },
        either: [["ielts", "toeic"]], rounds: [2], scored: [2] },
    ],
  });
});
