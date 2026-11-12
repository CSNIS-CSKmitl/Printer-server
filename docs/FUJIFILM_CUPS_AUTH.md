# คู่มือการตั้งค่า CUPS Filter และ User Authentication สำหรับเครื่องพิมพ์ Fujifilm / Fuji Xerox

เอกสารนี้อธิบายแนวทางการแก้ปัญหาและการตั้งค่าระบบพิมพ์ CUPS บน Linux เมื่อเชื่อมต่อกับเครื่องพิมพ์มัลติฟังก์ชัน **Fujifilm / Fuji Xerox (เช่น ตระกูล Apeos 3560 / ApeosPort / DocuCentre)** ที่มีการเปิดใช้งานระบบ **User Authentication / Accounting (Auditron)**

---

## 1. ปัญหาที่พบ (Issue)

เมื่อผู้ใช้งานสั่งพิมพ์เอกสารผ่านระบบ Web Portal หรือสั่งผ่านคำสั่ง `lp`:
1. **ที่หน้าจอเครื่องพิมพ์**: คำสั่งพิมพ์ถูกยกเลิกทันที (Canceled) พร้อมข้อความ:
   > *"The job has been canceled because the user account is invalid."*  
   > *Host Name: \<IP ของ Print Server\>*  
   > *User: Local User*  
   > *(หรือขึ้น Fault Code 016-757 / 016-758)*
2. **ที่หน้าเว็บระบบพิมพ์**: ถึงแม้กระดาษจะพิมพ์ออกมาได้แล้ว แต่หน้าเว็บแสดงสถานะ **"Failed (Canceled at printer / Out of paper)"** และระบบทำการคืนโควตา (Refund) ให้นักศึกษาอัตโนมัติ

---

## 2. สาเหตุทางเทคนิค (Root Cause Analysis)

### 2.1 ทำไมเครื่องพิมพ์จึงปฏิเสธคำสั่งพิมพ์ (User Invalid)?
* เครื่องพิมพ์ Apeos มีการเปิดใช้งาน **Device Authentication / Local Accounting** ซึ่งบังคับให้ทุก Print Job ที่ส่งเข้ามาผ่านพอร์ต 9100 (RAW Socket) หรือ IPP/LPR ต้องมีข้อมูล **User ID** และ **Password** แนบมาในส่วนหัวของไฟล์พิมพ์ (PJL Headers)
* ไดรเวอร์ Linux ของ Fujifilm อย่างเป็นทางการ (`fflinuxprint` / ไบนารี `/usr/lib/cups/filter/pdftopjlff`) เป็น Closed-source binary ที่**ไม่รองรับการส่ง Authentication Headers (`@JOAU` และ `@JOAP`)**
* คำสั่งพิมพ์จึงถูกส่งออกไปในฐานะ **"Local User" (ไม่มีรหัสผ่าน)** ทำให้เครื่องพิมพ์ปฏิเสธงานพิมพ์ทันที

### 2.2 ทำไมหน้าเว็บถึงฟ้องสถานะ Failed ทั้งที่กระดาษพิมพ์ออก?
* ตัว Worker มอนิเตอร์งานพิมพ์ (`checkPrintJobsStatus.ts`) จะตรวจสอบจำนวนหน้าที่พิมพ์สำเร็จจริงจากไฟล์ประวัติของ CUPS (`/var/log/cups/page_log`)
* ตัวฟิลเตอร์ `pdftopjlff` ของ Fujifilm **ไม่พ่นสัญญาณนับหน้า (`PAGE: <หน้า> <จำนวนสำเนา>`) ออกมาทาง stderr** ตามข้อกำหนดมาตรฐานของ CUPS
* ส่งผลให้ CUPS บันทึกใน `page_log` เป็น `total 0` หน้าเสมอ
* เมื่อระบบมอนิเตอร์เห็นว่างานมี `job.pages = 1` แต่ `page_log` รายงานว่าพิมพ์ได้ `0` หน้า ระบบจึงเข้าใจว่างานติดขัดหรือถูกยกเลิกระหว่างพิมพ์ และปรับสถานะเป็น **Failed** พร้อมคืนโควตาให้อัตโนมัติ

---

## 3. วิธีการแก้ไข (Solution)

เราใช้เทคนิค **CUPS Filter Wrapper Script** เข้ามาแทรกแซงการทำงานของ CUPS ระหว่างแปลงไฟล์ ก่อนส่งข้อมูลไปยัง Socket Port 9100 ของเครื่องพิมพ์

### 3.1 สคริปต์ติดตั้งอัตโนมัติ
ในโปรเจกต์มีสคริปต์ติดตั้งอยู่ที่:
[`scripts/setup-fuji-cups-auth.sh`](../scripts/setup-fuji-cups-auth.sh)

**คำสั่งรันติดตั้งบน Print Server (สิทธิ์ root):**
```bash
# กำหนด User และ Password ของเครื่องพิมพ์ (ค่าเริ่มต้น: user=printerserver, pass=cskmitl)
export FUJI_AUTH_USER="printerserver"
export FUJI_AUTH_PASS="cskmitl"

sudo bash scripts/setup-fuji-cups-auth.sh
```

### 3.2 การทำงานภายใน Wrapper
สคริปต์จะทำการ:
1. แบ็กอัปไบนารีดั้งเดิมของไดรเวอร์ไว้ที่ `pdftopjlff.orig` และ `pstopdfff.orig`
2. สร้างสคริปต์ Wrapper ขึ้นมาแทนที่:
   - **ตรวจนับหน้าจริงล่วงหน้า**: ใช้เครื่องมือ `pdfinfo` อ่านจำนวนหน้าของไฟล์ PDF แล้วส่งข้อความ `PAGE: <p> <copies>` และ `PAGE: total <pages>` ออกทาง stderr เพื่อให้ CUPS บันทึกลง `page_log` ได้อย่างแม่นยำ
   - **แทรก PJL Authentication Headers**: ส่ง Stream ผ่าน `awk` เพื่อแทรกข้อมูลผู้ใช้ลงหลังบรรทัด `@PJL COMMENT Version:4.00`:
     ```pjl
     @PJL SET USERNAME="printerserver"
     @PJL SET JOBATTR="@JOAU=printerserver"
     @PJL SET JOBATTR="@JOAP=cskmitl"
     ```
3. สั่ง Restart บริการ CUPS (`systemctl restart cups`)

---

## 4. วิธีการย้อนกลับ (Rollback)

หากต้องการนำ Wrapper ออกและกลับไปใช้ไบนารีเดิมของไดรเวอร์:
```bash
sudo cp -p /usr/lib/cups/filter/pdftopjlff.orig /usr/lib/cups/filter/pdftopjlff
sudo cp -p /usr/lib/cups/filter/pstopdfff.orig /usr/lib/cups/filter/pstopdfff
sudo systemctl restart cups
```

---

## 5. วิธีแก้ทางเลือกที่ฝั่งเครื่องพิมพ์ (Printer Web Interface)

หากไม่ต้องการตรวจสอบ User/Password สำหรับงานพิมพ์ที่ส่งมาจาก Print Server ในเครือข่าย สามารถตั้งค่าที่หน้าเว็บของเครื่องพิมพ์ได้โดยตรง:
1. เข้าเบราว์เซอร์ไปที่ IP เครื่องพิมพ์ เช่น `https://192.168.1.2`
2. ล็อกอินด้วยบัญชี **Administrator** (ค่าเริ่มต้นมักเป็น user: `11111` / pass: `x-admin` หรือตามที่สถาบันตั้งไว้)
3. ไปที่เมนู **Permissions (สิทธิ์การใช้งาน)** $\rightarrow$ **Accounting / Authentication (การตรวจสอบสิทธิ์/บัญชี)**
4. เลือกหัวข้อ **Non-Account Print (การพิมพ์โดยไม่มีข้อมูลบัญชีผู้ใช้)** หรือ **Job Without User ID**
5. เปลี่ยนการตั้งค่าจาก *Reject / Cancel* เป็น **"Allow" (อนุญาต)** แล้วบันทึกการตั้งค่า
