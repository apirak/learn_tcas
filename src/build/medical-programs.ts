// หลักสูตร กสพท รอบ 3 จาก CSV ที่ได้จากทีม — mytcas ไม่แสดงหลักสูตร กสพท รายหลักสูตร
// ใช้แค่ข้อมูลหลักสูตร + scores; min_score_last_year, text6, adt_ts, row_hash ไม่ถูกใช้ (ไม่ขึ้น browse.json)
import type { AdmissionRound, Program, University } from "../shared/types.ts";

/** ต้นชื่อหลักสูตร → กลุ่มสาขา (สาขา 01) — ชื่อกลุ่มกับชื่อสาขาเหมือนกันทั้ง 4 */
const FIELDS: [prefix: string, group: string, name: string][] = [
  ["แพทยศาสตรบัณฑิต", "10", "แพทยศาสตร์"],
  ["ทันตแพทยศาสตรบัณฑิต", "12", "ทันตแพทยศาสตร์"],
  ["เภสัชศาสตรบัณฑิต", "13", "เภสัชศาสตร์"], // "เภสัชศาสตรบัณฑิต (ภ.บ.)"
  ["สัตวแพทยศาสตรบัณฑิต", "14", "สัตวแพทยศาสตร์"],
];

/** CSV (RFC 4180: "" ใน "..." = ") → แถวละ object ตาม header; ตัด BOM (Excel "CSV UTF-8") และบรรทัดว่าง */
// ponytail: parser เล็ก ๆ — ถ้ารูปแบบไฟล์เปลี่ยนบ่อย ค่อยใช้ lib
export function parseCsv(text: string): Record<string, string>[] {
  if (text.startsWith("﻿")) text = text.slice(1);
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
  const [header, ...data] = rows.filter(r => r.some(c => c !== ""));
  return data.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** มหาวิทยาลัยที่ชื่ออยู่ใน faculty_name (ชื่อยาวสุด) — ตัวถัดจากชื่อต้องไม่ใช่อักษรไทย
 *  ("มหาวิทยาลัยกรุงเทพ" ไม่ตรงกับ "มหาวิทยาลัยกรุงเทพธนบุรี"); ไม่เจอ = undefined */
// ponytail: ต้องเป็นชื่อเต็มตาม universities.json — ชื่อย่อ (ม.xxx) ไม่เจอ ถ้ามีในไฟล์ค่อยเพิ่มตารางชื่อย่อ
export function universityInFaculty(faculty: string, universities: University[]): University | undefined {
  return universities
    .filter(u => {
      const i = faculty.indexOf(u.university_name);
      return i >= 0 && !/[\u0E00-\u0E7F]/.test(faculty[i + u.university_name.length] ?? "");
    })
    .sort((a, b) => b.university_name.length - a.university_name.length)[0];
}

/** CSV กสพท → แถวของ programs.json + admission_rounds.json
 *  มหาวิทยาลัยจริงจากชื่อใน faculty_name; ไม่เจอ (กองทัพบก, …) = university_id ในไฟล์ (031)
 *  unmatched = จำนวนหลักสูตรที่ไม่เจอมหาวิทยาลัย */
export function medicalPrograms(
  csv: string, universities: University[],
): { programs: Program[]; rounds: AdmissionRound[]; unmatched: number } {
  const programs: Program[] = [];
  const rounds: AdmissionRound[] = [];
  let unmatched = 0;
  for (const r of parseCsv(csv)) {
    const field = FIELDS.find(([prefix]) => r.program_name?.startsWith(prefix));
    if (!field) throw new Error(`ไม่รู้สาขาของหลักสูตร กสพท: ${r.program_name} (${r.program_id})`);
    if (!r.scores) throw new Error(`หลักสูตร กสพท ไม่มี scores: ${r.program_name} (${r.program_id})`);
    const [, group, name] = field;
    const university = universityInFaculty(r.faculty_name ?? "", universities);
    if (!university) unmatched++;
    const universityId = university?.university_id ?? r.university_id.padStart(3, "0"); // เปิดใน Excel แล้วเซฟ → "31"
    programs.push({
      program_id: r.program_id,
      program_name_th: r.program_name,
      program_type_name_th: r.program_type_name,
      university_id: universityId,
      group_field_id: group,
      group_field_th: name,
      field_id: "01",
      field_name_th: name,
      campus_name_th: r.campus_name,
      faculty_name_th: r.faculty_name,
    });
    rounds.push({
      program_id: r.program_id,
      university_id: universityId,
      type: `${r.admission_round}_${r.admission_year}`,
      round: Number(r.admission_round),
      scores: JSON.parse(r.scores), // ข้อความ "null" → null
    });
  }
  return { programs, rounds, unmatched };
}
