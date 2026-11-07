// รวมรอบรับ + พจนานุกรม score key → ต่อรอบรับ: วิชาที่ใช้ + สัดส่วน + คะแนนขั้นต่ำ (program_exams.json)
import type { AdmissionRound, MinScoreGroup, ProgramExam, ScoreComponent, ScoreKey } from "../shared/types.ts";

/** scores ของ mytcas → รายการองค์ประกอบคะแนน */
export function scoreComponents(scores: AdmissionRound["scores"]): ScoreComponent[] {
  const weights = { ...scores };
  const components: ScoreComponent[] = [];
  if ("cal_subject_name" in weights) {
    // "a|b c" = a [หรือ] ผลรวมของ b กับ c — ตามที่เว็บแสดง
    const options = String(weights.cal_subject_name).trim().split("|").map(opt => opt.trim().split(/\s+/).filter(Boolean));
    components.push({ key: null, weight: Number(weights.cal_score_sum), choose_one_of: options });
    delete weights.cal_subject_name;
    delete weights.cal_score_sum;
    delete weights.cal_type;
  }
  return [...Object.entries(weights).map(([key, weight]) => ({ key, weight: Number(weight) })), ...components];
}

/** score_conditions ของ mytcas (min_<key>: ตัวเลข) → { key: คะแนนขั้นต่ำ } */
export function minScores(conditions: AdmissionRound["score_conditions"]): Record<string, number> {
  return Object.fromEntries(Object.entries(conditions ?? {})
    .filter(([k, v]) => k.startsWith("min_") && typeof v === "number")
    .map(([k, v]) => [k.slice(4), v as number]));
}

/** score_condition + subject_names + score_minimum → กลุ่มวิชาที่มีขั้นต่ำร่วมกัน */
export function minScoreGroup(conditions: AdmissionRound["score_conditions"]): MinScoreGroup | null {
  const rule = { 1: "any", 2: "sum" }[Number(conditions?.score_condition)] as MinScoreGroup["rule"] | undefined;
  if (!rule) return null;
  const keys = String(conditions!.subject_names ?? "").trim().split(/\s+/).filter(Boolean).map(k => k.replace(/^min_/, ""));
  return keys.length ? { rule, keys, minimum: String(conditions!.score_minimum ?? "").trim() } : null;
}

/** รอบ 3 ปีก่อน → เฉพาะหลักสูตรที่รอบ 3 ปีนี้ยังไม่ประกาศสัดส่วนคะแนน (ข้อมูลปีล่าสุดมักยังไม่ครบ) */
export function lastYearFill(current: ProgramExam[], lastYear: ProgramExam[]): ProgramExam[] {
  const scored = new Set(current.filter(e => e.round === 3 && e.components.some(c => c.weight > 0)).map(e => e.program_id));
  return lastYear.filter(e => e.round === 3 && !scored.has(e.program_id));
}

const isGrade =(k: string) => /^(credit_)?gpa/.test(k);

export function buildProgramExams(rounds: AdmissionRound[], scoreKeys: ScoreKey[]): ProgramExam[] {
  const known = new Set(scoreKeys.map(k => k.key));
  const exams: ProgramExam[] = [];
  for (const r of rounds) {
    const components = scoreComponents(r.scores);
    const mins = minScores(r.score_conditions);
    const group = minScoreGroup(r.score_conditions);
    if (!components.length && [...Object.keys(mins), ...(group?.keys ?? [])].every(isGrade)) {
      continue; // ไม่มีสัดส่วนคะแนน และมีแค่เกรดขั้นต่ำ (เช่น portfolio + GPAX) — ไม่ต้องสอบ
    }
    const unknown = components.filter(c => c.key !== null && !known.has(c.key));
    if (unknown.length) throw new Error(`ไม่รู้จัก score key: ${JSON.stringify(unknown)} (${r.program_id})`);
    exams.push({
      program_id: r.program_id,
      university_id: r.university_id,
      round: r.round,
      project_id: r.project_id ?? null,
      project_name_th: r.project_name_th ?? null,
      receive_student_number: r.receive_student_number ?? null,
      min_total_score: r.min_total_score ?? null,
      components,
      min_scores: mins,
      min_score_group: group,
    });
  }
  return exams;
}
