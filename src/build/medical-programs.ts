// หลักสูตร กสพท (031) รอบ 3 จาก CSV ที่ได้จากทีม — mytcas ไม่แสดงหลักสูตร กสพท รายหลักสูตร
// ใช้แค่ข้อมูลหลักสูตร + scores; min_score_last_year, text6, adt_ts, row_hash ไม่ถูกใช้ (ไม่ขึ้น browse.json)
import type { AdmissionRound, Program } from "../shared/types.ts";

/** ต้นชื่อหลักสูตร → กลุ่มสาขา (สาขา 01) — ชื่อกลุ่มกับชื่อสาขาเหมือนกันทั้ง 4 */
const FIELDS: [prefix: string, group: string, name: string][] = [
  ["แพทยศาสตรบัณฑิต", "10", "แพทยศาสตร์"],
  ["ทันตแพทยศาสตรบัณฑิต", "12", "ทันตแพทยศาสตร์"],
  ["เภสัชศาสตรบัณฑิต", "13", "เภสัชศาสตร์"], // "เภสัชศาสตรบัณฑิต (ภ.บ.)"
  ["สัตวแพทยศาสตรบัณฑิต", "14", "สัตวแพทยศาสตร์"],
];

/** CSV (RFC 4180: "" ใน "..." = ") → แถวละ object ตาม header */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') cell += text[i++];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { rows.push([...row, cell]); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  const [header, ...data] = rows;
  return data.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** CSV กสพท → แถวของ programs.json + admission_rounds.json (มหาวิทยาลัย 031 ตามไฟล์) */
export function medicalPrograms(csv: string): { programs: Program[]; rounds: AdmissionRound[] } {
  const programs: Program[] = [];
  const rounds: AdmissionRound[] = [];
  for (const r of parseCsv(csv)) {
    const field = FIELDS.find(([prefix]) => r.program_name.startsWith(prefix));
    if (!field) throw new Error(`ไม่รู้สาขาของหลักสูตร กสพท: ${r.program_name} (${r.program_id})`);
    const [, group, name] = field;
    programs.push({
      program_id: r.program_id,
      program_name_th: r.program_name,
      program_type_name_th: r.program_type_name,
      university_id: r.university_id,
      group_field_id: group,
      group_field_th: name,
      field_id: "01",
      field_name_th: name,
      campus_name_th: r.campus_name,
      faculty_name_th: r.faculty_name,
    });
    rounds.push({
      program_id: r.program_id,
      university_id: r.university_id,
      type: `${r.admission_round}_${r.admission_year}`,
      round: Number(r.admission_round),
      scores: JSON.parse(r.scores), // ข้อความ "null" → null
    });
  }
  return { programs, rounds };
}
