// โครงสร้างข้อมูลแต่ละไฟล์ใน data/ — ระบุเฉพาะ field ที่โค้ดใช้ ที่เหลือเก็บตามที่ mytcas ส่งมา

/** programs.json — 1 แถวต่อวิชาเอก จึงมี program_id ซ้ำได้ */
export type Program = {
  program_id: string;
  program_name_th: string;
  program_type_name_th: string;
  university_id: string;
  group_field_id: string;
  group_field_th: string;
  field_id: string;
  field_name_th: string;
  campus_name_th: string;
  faculty_name_th: string;
  [field: string]: unknown;
};

/** universities.json */
export type University = {
  university_id: string;
  university_name: string;
  /** รอบที่มีข้อมูลรอบรับจริง — ใช้แทน is_accepted_roundN ซึ่งไม่ได้แปลว่าเปิดรับ */
  rounds_with_data?: number[];
  [field: string]: unknown;
};

/** ไฟล์ rounds/{program_id}.json บน S3 — 1 แถวต่อโครงการรับ ของ 1 หลักสูตร */
export type RawAdmissionRound = {
  program_id: string;
  university_id: string;
  type: string; // "3_2570"
  project_id?: string;
  project_name_th?: string;
  receive_student_number?: number | null;
  min_total_score?: number | null;
  /** key → น้ำหนัก % และ cal_* (วิชาเลือกสอบ) */
  scores?: Record<string, number | string> | null;
  /** min_<key> → คะแนนขั้นต่ำ */
  score_conditions?: Record<string, unknown> | null;
  [field: string]: unknown;
};

/** admission_rounds.json — RawAdmissionRound + เลขรอบ */
export type AdmissionRound = RawAdmissionRound & { round: number }; // 3 — จาก type "3_2570"

/** score_keys.json — พจนานุกรม key ของ scores จาก JS ของ course.mytcas.com */
export type ScoreKey = {
  key: string;
  label: string;
  max_value: number;
  short_label: string;
  /** วิชาใน exam_subjects.json ที่ key นี้หมายถึง: tgat → tgat1/2/3, gpax → [] */
  exam_subjects?: string[];
};

/** exam_subjects.json — 1 วิชาสอบต่อหน้า blueprint */
export type ExamSubject = {
  slug: string;
  score_key: string;
  code: string;
  name: string;
  url: string;
  intro: string | null;
  sections: { title: string; topics: string[]; questions: string | null }[];
  format: string | null;
  duration_min: number | string | null;
  notes: string | null;
  question_groups: { label: string; questions: number }[];
  total_questions: number | null;
  full_score: number | null;
  examples: ExampleQuestion[];
};

export type ExampleQuestion = {
  title: string;
  answer_type: string | null;
  question: string;
  question_images: string[];
  choices: { no: number; text: string; images: string[]; is_answer: boolean }[];
  answer: string | null;
  explanation: string;
  explanation_images: string[];
};

/** program_exams.json — 1 แถวต่อรอบรับที่ใช้คะแนนสอบ */
export type ProgramExam = {
  program_id: string;
  university_id: string;
  round: number;
  project_id: string | null;
  project_name_th: string | null;
  receive_student_number: number | null;
  min_total_score: number | null;
  components: ScoreComponent[];
  /** key → คะแนนขั้นต่ำ; key อาจลงท้าย _tscore (คะแนน T) */
  min_scores: Record<string, number>;
  min_score_group: MinScoreGroup | null;
};

/** score_conditions.score_condition ของ mytcas: 1 = ขั้นต่ำของวิชาใดวิชาหนึ่ง (any), 2 = ขั้นต่ำของผลรวม (sum)
 *  minimum เก็บเป็นข้อความตามที่เว็บแสดง — อาจเป็นเลขเดียว หรือเลขต่อวิชา เช่น "520 5.5 90" / "B1 35 4" */
export type MinScoreGroup = { rule: "any" | "sum"; keys: string[]; minimum: string };

/** วิชาที่มีน้ำหนัก หรือ key: null + choose_one_of = เลือกสอบ 1 ตัวเลือก แต่ละตัวเลือกคือผลรวมของหลายวิชา */
export type ScoreComponent =
  | { key: string; weight: number }
  | { key: null; weight: number; choose_one_of: string[][] };

/** browse.json — ไฟล์เล็กสำหรับ ui/ (schema ใน README) */
export type Browse = {
  groups: Record<string, string>;
  fields: Record<string, string>;
  universities: Record<string, string>;
  /** key ของวิชาสอบ และเกณฑ์อื่นใน others → ชื่อ */
  subjects: Record<string, string>;
  /** key ใน either → ชื่อสั้น เช่น ielts → IELTS */
  short: Record<string, string>;
  programs: BrowseProgram[];
};

export type BrowseProgram = {
  id: string;
  name: string;
  type: string;
  uni: string;
  group: string;
  field: string;
  /** วิทยาเขต (campus_name_th) */
  campus: string;
  /** คณะ (faculty_name_th) */
  faculty: string;
  /** วิชา → น้ำหนัก % สูงสุดในทุกรอบ (0 = ใช้แค่คะแนนขั้นต่ำ) */
  exams: Record<string, number>;
  /** เกณฑ์ที่ไม่ใช่การสอบ (gpax, portfolio, interview, …) → น้ำหนัก % สูงสุดในทุกรอบ */
  others: Record<string, number>;
  /** กลุ่ม score key ที่ต้องผ่านขั้นต่ำวิชาใดวิชาหนึ่ง เช่น [["ielts", "toefl_ibt", "toeic"]] */
  either: string[][];
  /** รอบที่มีใน mytcas */
  rounds: number[];
  /** รอบที่ประกาศสัดส่วนคะแนนแล้ว */
  scored: number[];
  /** รอบ 3 ใช้สัดส่วนคะแนนของปีก่อน เพราะปีนี้ยังไม่ประกาศ */
  ly?: true;
};
