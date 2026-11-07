// ดึงข้อมูล TCAS จาก mytcas แล้วรวมเป็น JSON ใน data/
//
//   npm run scrape   # ดาวน์โหลดทั้งหมด แล้วสร้างไฟล์รวม
//   npm run browse   # สร้าง program_exams.json + browse.json ใหม่จากไฟล์ใน data/ ไม่ดึงเว็บ
//
// src/download/  ดึงจากเว็บ (ไฟล์ดิบตามที่ mytcas ส่งมา)
// src/parse/     แปลง HTML/JS ของเว็บเป็นข้อมูล (ใช้ใน download/)
// src/build/     เอาสิ่งที่ดาวน์โหลดมารวม/แปลงเป็นไฟล์ที่ใช้งาน — ไม่แตะเว็บ
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildBrowse } from "./build/browse.ts";
import { buildProgramExams, lastYearFill } from "./build/program-exams.ts";
import { linkScoreKeysToSubjects } from "./build/score-keys-with-subjects.ts";
import { addRoundsWithData } from "./build/universities-with-rounds.ts";
import { downloadAdmissionRounds, ROUNDS_URL } from "./download/admission-rounds.ts";
import { downloadExamSubjects } from "./download/exam-subjects.ts";
import { downloadPrograms, PROGRAMS_URL } from "./download/programs.ts";
import { downloadScoreKeys } from "./download/score-keys.ts";
import { downloadUniversities, UNIVERSITIES_URL } from "./download/universities.ts";
import { loadDataFile, saveDataFile } from "./shared/data-files.ts";
import { BLUEPRINT } from "./shared/mytcas-urls.ts";
import type { AdmissionRound, Program, ProgramExam, RawAdmissionRound, ScoreKey, University } from "./shared/types.ts";

const BROWSE_SOURCE = "programs.json + admission_rounds.json + program_exams.json + score_keys.json + data_import (รอบ 3 ปีก่อน)";

// รอบ 3 ปีก่อน (ไฟล์ที่ได้มาจากทีม ไม่ได้ดึงจากเว็บ) — ไม่อยู่ใน git เพราะมีคะแนนพยากรณ์ภายใน
const LAST_YEAR_FILE = new URL("../data_import/cal_TargetSetting_Program_Result.json", import.meta.url);

/** รอบ 3 ปีก่อน → ProgramExam ที่ใช้เติมหลักสูตรที่ปีนี้ยังไม่ประกาศ; ไม่มีไฟล์ = ไม่เติม */
async function lastYearExams(current: ProgramExam[], scoreKeys: ScoreKey[]): Promise<ProgramExam[]> {
  let raw: RawAdmissionRound[];
  try {
    raw = JSON.parse(await readFile(LAST_YEAR_FILE, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    console.warn("ไม่พบ data_import/cal_TargetSetting_Program_Result.json — ไม่เติมรอบ 3 จากปีก่อน");
    return [];
  }
  const rounds = raw.map(r => ({
    ...r,
    university_id: String(r.university_id).padStart(3, "0"), // ไฟล์นี้เป็นตัวเลข 1 → "001"
    round: Number(r.type.split("_")[0]), // "3_2569" → 3
  }));
  const fill = lastYearFill(current, buildProgramExams(rounds, scoreKeys));
  console.log(`เติมรอบ 3 จากปีก่อน: ${new Set(fill.map(e => e.program_id)).size} หลักสูตร`);
  return fill;
}

async function scrapeAll() {
  const subjects = await downloadExamSubjects();
  // ถ้าหน้าเว็บเปลี่ยนโครงสร้าง ให้ล้มตรงนี้ แทนที่จะได้ไฟล์ว่าง ๆ
  const math1 = subjects.find(s => s.slug === "a-level-61-math1");
  assert.ok(subjects.length >= 20 && math1?.sections.length === 4 && math1.duration_min === 90, "blueprint เปลี่ยนโครงสร้าง");
  assert.ok(math1.examples[1].choices.some(c => c.is_answer), "ไม่พบเฉลยในตัวอย่างข้อสอบ");
  const incomplete = subjects.filter(s => !(s.sections.length && s.total_questions && s.full_score)).map(s => s.slug);
  assert.deepEqual(incomplete, [], "วิชาที่ข้อมูลไม่ครบ");
  await saveDataFile("exam_subjects.json", BLUEPRINT, subjects);

  const programs = await downloadPrograms();
  await saveDataFile("programs.json", PROGRAMS_URL, programs);

  const programIds = [...new Set(programs.map(p => p.program_id))]; // 1 แถวต่อวิชาเอก — program_id จึงซ้ำได้
  const rounds = await downloadAdmissionRounds(programIds);
  await saveDataFile("admission_rounds.json", ROUNDS_URL, rounds);

  const universities = addRoundsWithData(await downloadUniversities(), rounds);
  await saveDataFile("universities.json", UNIVERSITIES_URL, universities);

  const { scriptUrl, scoreKeys: rawScoreKeys } = await downloadScoreKeys();
  const scoreKeys = linkScoreKeysToSubjects(rawScoreKeys, subjects);
  assert.deepEqual(scoreKeys.find(k => k.key === "tgat")?.exam_subjects, ["tgat1", "tgat2", "tgat3"]);
  await saveDataFile("score_keys.json", scriptUrl, scoreKeys);

  const programExams = buildProgramExams(rounds, scoreKeys);
  await saveDataFile("program_exams.json", "admission_rounds.json + score_keys.json", programExams);

  const browse = buildBrowse(programs, programExams, scoreKeys, universities, rounds, await lastYearExams(programExams, scoreKeys));
  await saveDataFile("browse.json", BROWSE_SOURCE, browse, { count: browse.programs.length });
}

/** สร้าง program_exams.json + browse.json ใหม่จากไฟล์ใน data/ โดยไม่ดึงเว็บ — fetched_at ใช้ของไฟล์ต้นทาง */
async function rebuildBrowse() {
  const programs = await loadDataFile<Program[]>("programs.json");
  const rounds = await loadDataFile<AdmissionRound[]>("admission_rounds.json");
  const scoreKeys = (await loadDataFile<ScoreKey[]>("score_keys.json")).data;
  const programExams = buildProgramExams(rounds.data, scoreKeys);
  await saveDataFile("program_exams.json", "admission_rounds.json + score_keys.json", programExams, { fetchedAt: rounds.fetched_at });
  const browse = buildBrowse(
    programs.data,
    programExams,
    scoreKeys,
    (await loadDataFile<University[]>("universities.json")).data,
    rounds.data,
    await lastYearExams(programExams, scoreKeys),
  );
  await saveDataFile("browse.json", BROWSE_SOURCE, browse, { count: browse.programs.length, fetchedAt: programs.fetched_at });
}

await (process.argv[2] === "browse" ? rebuildBrowse() : scrapeAll());
