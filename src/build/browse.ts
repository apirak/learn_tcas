// รวมทุกอย่างเป็นไฟล์เล็กไฟล์เดียวสำหรับ ui/ (browse.json)
// 1 แถวต่อหลักสูตร + วิชาที่มีโอกาสต้องสอบ = อยู่ใน components หรือ min_scores ของรอบใดรอบหนึ่ง
import type { AdmissionRound, Browse, BrowseProgram, Program, ProgramExam, ScoreKey, University } from "../shared/types.ts";

const NOT_EXAM = ["gpa", "portfolio", "interview", "priority_score"]; // เกณฑ์ที่ไม่ใช่การสอบ

/** score key → วิชาสอบจริง: tgat → tgat1/2/3, a_lv_82_tscore → a_lv_82, gpax → [], tpat1 (ไม่มีหน้า blueprint) → tpat1 */
export function subjectsOfKey(key: string, keyMap: Map<string, ScoreKey>): string[] {
  const base = key.replace(/_(tscore|pr)$/, "");
  if (NOT_EXAM.some(prefix => base.startsWith(prefix))) return [];
  const linked = keyMap.get(base)?.exam_subjects;
  return linked?.length ? linked : [base];
}

/** program_id → { วิชา: น้ำหนัก % สูงสุดในทุกรอบ (0 = ใช้แค่คะแนนขั้นต่ำ) } */
export function examWeightsByProgram(programExams: ProgramExam[], keyMap: Map<string, ScoreKey>) {
  const byProgram = new Map<string, Record<string, number>>();
  for (const e of programExams) {
    if (!byProgram.has(e.program_id)) byProgram.set(e.program_id, {});
    const weights = byProgram.get(e.program_id)!;
    for (const c of e.components) {
      // ตัวเลือกใน choose_one_of = ผลรวมของหลายวิชา → แบ่งน้ำหนักเท่า ๆ กัน
      // ponytail: สมมติคะแนนเต็มทุกวิชาเท่ากัน (100) — ถ้าไม่เท่า ต้องถ่วงด้วย max_value ของ score_keys
      const options = c.key === null ? c.choose_one_of : [[c.key]];
      for (const option of options) {
        const weight = Math.round(c.weight / option.length);
        for (const s of option.flatMap(k => subjectsOfKey(k, keyMap))) {
          weights[s] = Math.max(weights[s] ?? 0, weight);
        }
      }
    }
    // ขั้นต่ำของผลรวม = ต้องสอบทุกวิชาในกลุ่ม; ขั้นต่ำของวิชาใดวิชาหนึ่ง ไปอยู่ใน either แทน
    // (mytcas มักส่งขั้นต่ำรายวิชาของกลุ่ม "ใดวิชาหนึ่ง" มาใน min_<key> ด้วย — ไม่นับว่าต้องสอบทุกวิชา)
    // กลุ่มที่มีวิชาเดียว = ขั้นต่ำธรรมดา
    const g = e.min_score_group;
    const anyOf = new Set(g?.rule === "any" && g.keys.length > 1 ? g.keys : []);
    const required = [...Object.keys(e.min_scores), ...(g?.keys ?? [])].filter(k => !anyOf.has(k));
    for (const s of required.flatMap(k => subjectsOfKey(k, keyMap))) weights[s] ??= 0;
  }
  return byProgram;
}

/** program_id → { เกณฑ์ที่ไม่ใช่การสอบ (gpax, portfolio, …): น้ำหนัก % สูงสุดในทุกรอบ } — เฉพาะที่มีน้ำหนักจริง */
export function otherWeightsByProgram(programExams: ProgramExam[], keyMap: Map<string, ScoreKey>) {
  const byProgram = new Map<string, Record<string, number>>();
  for (const e of programExams) {
    for (const c of e.components) {
      if (c.key === null || c.weight <= 0 || subjectsOfKey(c.key, keyMap).length) continue;
      if (!byProgram.has(e.program_id)) byProgram.set(e.program_id, {});
      const weights = byProgram.get(e.program_id)!;
      weights[c.key] = Math.max(weights[c.key] ?? 0, c.weight);
    }
  }
  return byProgram;
}

/** program_id → กลุ่ม score key ที่ต้องผ่านขั้นต่ำวิชาใดวิชาหนึ่ง เช่น [ielts, toefl_ibt, toeic] (ไม่ซ้ำกันข้ามรอบ) */
export function eitherByProgram(programExams: ProgramExam[], keyMap: Map<string, ScoreKey>) {
  const byProgram = new Map<string, string[][]>();
  for (const e of programExams) {
    const g = e.min_score_group;
    if (g?.rule !== "any" || g.keys.length < 2) continue;
    const keys = [...new Set(g.keys.map(k => k.replace(/_(tscore|pr)$/, "")))];
    if (keys.every(k => !subjectsOfKey(k, keyMap).length)) continue; // เกรดล้วน ไม่ใช่การสอบ
    const groups = byProgram.get(e.program_id) ?? [];
    if (!groups.some(x => x.join() === keys.join())) groups.push(keys);
    byProgram.set(e.program_id, groups);
  }
  return byProgram;
}

/** program_id → [รอบที่มีใน mytcas, รอบที่ประกาศสัดส่วนคะแนนแล้ว] */
export function roundsByProgram(rounds: AdmissionRound[], programExams: ProgramExam[]) {
  const collect = (rows: { program_id: string; round: number }[]) => {
    const m = new Map<string, Set<number>>();
    for (const r of rows) m.set(r.program_id, (m.get(r.program_id) ?? new Set()).add(r.round));
    return (id: string) => [...(m.get(id) ?? [])].sort();
  };
  return {
    open: collect(rounds),
    scored: collect(programExams.filter(e => e.components.some(c => c.weight > 0))),
  };
}

export function buildBrowse(
  programs: Program[],
  programExams: ProgramExam[],
  scoreKeys: ScoreKey[],
  universities: University[],
  admissionRounds: AdmissionRound[],
  lastYear: ProgramExam[] = [], // รอบ 3 ปีก่อน ที่ใช้เติม (lastYearFill)
  lastYearIds: Iterable<string> = [], // หลักสูตรอื่นที่ใช้ข้อมูลปีก่อน (กสพท จาก CSV — อยู่ใน programExams แล้ว)
): Browse {
  const keyMap = new Map(scoreKeys.map(k => [k.key, k]));
  const all = [...programExams, ...lastYear];
  const weights = examWeightsByProgram(all, keyMap);
  const others = otherWeightsByProgram(all, keyMap);
  const either = eitherByProgram(all, keyMap);
  const filled = new Set([...lastYear.map(e => e.program_id), ...lastYearIds]);
  const rounds = roundsByProgram(admissionRounds, programExams);
  const fieldId = (p: Program) => `${p.group_field_id}-${p.field_id}`;

  const rows = new Map<string, BrowseProgram>(); // programs.json มี 1 แถวต่อวิชาเอก — เก็บแถวแรกของแต่ละ program_id
  for (const p of programs) {
    if (rows.has(p.program_id)) continue;
    rows.set(p.program_id, {
      id: p.program_id,
      name: p.program_name_th,
      type: p.program_type_name_th,
      uni: p.university_id,
      group: p.group_field_id,
      field: fieldId(p),
      campus: p.campus_name_th,
      faculty: p.faculty_name_th,
      exams: weights.get(p.program_id) ?? {},
      others: others.get(p.program_id) ?? {},
      either: either.get(p.program_id) ?? [],
      rounds: rounds.open(p.program_id),
      scored: rounds.scored(p.program_id),
      ...(filled.has(p.program_id) && { ly: true as const }),
    });
  }
  const eitherKeys = [...new Set([...rows.values()].flatMap(r => r.either.flat()))].sort();
  const used = [...new Set([...rows.values()].flatMap(r => [...Object.keys(r.exams), ...Object.keys(r.others), ...r.either.flat()]))].sort();
  return {
    groups: Object.fromEntries(programs.map(p => [p.group_field_id, p.group_field_th])),
    fields: Object.fromEntries(programs.map(p => [fieldId(p), p.field_name_th])),
    universities: Object.fromEntries(universities.map(u => [u.university_id, u.university_name])),
    subjects: Object.fromEntries(used.map(s => [s, keyMap.get(s)?.label ?? s])),
    short: Object.fromEntries(eitherKeys.map(s => [s, keyMap.get(s)?.short_label.trim() || s])),
    programs: [...rows.values()],
  };
}
