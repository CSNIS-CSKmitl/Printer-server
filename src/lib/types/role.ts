/**
 * บทบาทผู้ใช้งานทั้งหมดในระบบ
 */
export type UserRole =
  | "super_admin"
  | "superadmin"
  | "admin"
  | "head"
  | "teacher"
  | "teachers"
  | "staff"
  | "stuff"
  | "student"
  | "students"
  | "guest"
  | "guests"
  | "user";

/**
 * ชื่อบทบาทที่แสดงผลในหน้าจอและอีเมล (ภาษาไทย/ทางการ)
 */
export type DisplayRole =
  | "เจ้าหน้าที่ (Staff)"
  | "หัวหน้าภาควิชา (Head)"
  | "อาจารย์ (Teacher)"
  | "นักศึกษา (Student)"
  | "บุคคลภายนอก (Guest)"
  | "ผู้ใช้งาน";
