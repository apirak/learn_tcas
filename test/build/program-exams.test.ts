import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdmissionRound, ScoreKey } from "../../src/shared/types.ts";
import { buildProgramExams, lastYearFill, minScoreGroup, minScores, scoreComponents } from "../../src/build/program-exams.ts";

const key = (k: string): ScoreKey => ({ key: k, label: k, max_value: 100, short_label: k });
const SCORE_KEYS = ["tgat", "tpat3", "a_lv_61", "a_lv_64", "a_lv_65", "gpax"].map(key);

const round = (extra: Partial<AdmissionRound>): AdmissionRound =>
  ({ program_id: "P1", university_id: "001", type: "3_2570", round: 3, project_id: "x", ...extra });

test("plain scores: key → weight", () => {
  assert.deepEqual(scoreComponents({ tgat: 20, tpat3: 30 }), [
    { key: "tgat", weight: 20 },
    { key: "tpat3", weight: 30 },
  ]);
  assert.deepEqual(scoreComponents(null), []);
});

test("cal_subject_name: '|' = or, space = sum; appended after plain subjects", () => {
  assert.deepEqual(scoreComponents({
    cal_subject_name: " a_lv_64 | a_lv_65  a_lv_66 ", cal_score_sum: 20, cal_type: "max", tgat: 80,
  }), [
    { key: "tgat", weight: 80 },
    { key: null, weight: 20, choose_one_of: [["a_lv_64"], ["a_lv_65", "a_lv_66"]] },
  ]);
});

test("min_scores keeps numeric min_* conditions and strips the min_ prefix", () => {
  assert.deepEqual(minScores({ min_tgat: 30, min_gpax: 2.5, min_note: "ดูประกาศ", max_age: 25 }), { tgat: 30, gpax: 2.5 });
  assert.deepEqual(minScores(undefined), {});
});

test("score_condition: 1 = any one subject, 2 = sum; min_ prefix stripped, minimum kept as text", () => {
  assert.deepEqual(minScoreGroup({ score_condition: 1, subject_names: "min_ielts min_toeic ", score_minimum: "5.5 600" }),
    { rule: "any", keys: ["ielts", "toeic"], minimum: "5.5 600" });
  assert.deepEqual(minScoreGroup({ min_gpax: 3, score_condition: 2, subject_names: "min_a_lv_61 min_a_lv_64", score_minimum: "250" }),
    { rule: "sum", keys: ["a_lv_61", "a_lv_64"], minimum: "250" });
  assert.equal(minScoreGroup({ min_gpax: 3 }), null);
  assert.equal(minScoreGroup({ score_condition: 1, subject_names: "" }), null);
});

test("skips rounds with no exams: no score weights and only GPA minimums", () => {
  const exams = buildProgramExams([
    round({ scores: {}, score_conditions: { min_gpax: 3 } }), // portfolio + GPAX → skipped
    round({ round: 1, scores: {}, score_conditions: { min_tgat: 40 } }), // has an exam minimum → kept
    round({ round: 2, scores: { tgat: 100 }, receive_student_number: 10 }),
    round({ round: 1, score_conditions: { score_condition: 2, subject_names: "min_credit_gpa22 min_gpa23", score_minimum: "3" } }), // grades only → skipped
    round({ round: 4, score_conditions: { score_condition: 1, subject_names: "min_ielts min_toeic", score_minimum: "5 500" } }), // English test → kept
  ], SCORE_KEYS);
  assert.deepEqual(exams.map(e => e.round), [1, 2, 4]);
  assert.deepEqual(exams[1], {
    program_id: "P1", university_id: "001", round: 2, project_id: "x", project_name_th: null,
    receive_student_number: 10, min_total_score: null, components: [{ key: "tgat", weight: 100 }], min_scores: {},
    min_score_group: null,
  });
});

test("unknown score key throws (the site added a new key)", () => {
  assert.throws(() => buildProgramExams([round({ scores: { new_exam: 50 } })], SCORE_KEYS), /new_exam/);
});

test("lastYearFill: last year's round 3 only for programs whose round 3 this year has no weights", () => {
  const [p1, p2, p3] = buildProgramExams([
    round({ program_id: "P1", scores: { tgat: 100 } }),
    round({ program_id: "P2", scores: {}, score_conditions: { min_tgat: 30 } }), // minimum only = not announced
    round({ program_id: "P3", type: "1_2570", round: 1, scores: { tgat: 100 } }),
  ], SCORE_KEYS);
  const ly = buildProgramExams(["P1", "P2", "P3", "P4"].map(program_id => round({ program_id, type: "3_2569", scores: { a_lv_61: 100 } })), SCORE_KEYS);
  assert.deepEqual(lastYearFill([p1, p2, p3], ly).map(e => e.program_id), ["P2", "P3", "P4"]);
});
