# คำสั่งงาน Sonnet รอบ 1: กันกดซ้ำ, ส่งออกทั้งบัญชี, ติ๊กใน toast

ผู้เขียน: Opus (20 พ.ย. 2569) · ผู้ตรวจ: Opus ก่อน merge · เจ้าของต้องสั่งเองก่อน merge ทุกครั้ง

## ก่อนเริ่ม

- **อ่าน `CLAUDE.md` ทั้งไฟล์ก่อน** โดยเฉพาะหัวข้อ "Single source of truth", "Use the token scales", "Define each component once" และเรื่อง e2e ที่ "หยุดที่การบันทึกครั้งแรก"
- แตก branch `sonnet/round1-guards-export` ออกจาก `claude/confident-euler-l155ra` (branch นี้มีงานของ Opus รอบ 1 อยู่แล้ว ได้แก่ เพดาน AI และหน้าจอโหลดไม่สำเร็จ ห้ามแก้ไฟล์ `lib/ai-quota.ts`, `lib/startup.ts` และ `LoadFailedScreen`)
- commit แยกตามงาน 3 ก้อน (งานละอย่างน้อย 1 commit) ข้อความ commit เป็นภาษาอังกฤษสั้นๆ ตามแบบ `git log`
- **ห้ามอีโมจิ** ข้อความใหม่ใช้ภาษาไทยสุภาพ สะกด "แอป" (ไม่ใช่ "แอพ") ในข้อความใหม่เท่านั้น ข้อความเดิมไม่ต้องไล่แก้

## ตรวจงานก่อนส่ง (ต้องผ่านทั้งหมด)

```bash
npx tsc --noEmit
npm run lint
npm test
npm run verify:design
E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test --trace off
```

ถ้า e2e ไม่ผ่านเพราะเรื่องที่ไม่เกี่ยวกับงานนี้ ให้จดไว้ในรายงาน ห้ามข้ามหรือปิดเทส

---

## งาน A: กันกดบันทึกซ้ำ (ข้อ 2)

**ปัญหา**: `logRecurringNow` (`app/page.tsx`) สร้าง id ใหม่ทุกครั้งที่ถูกเรียก ส่วนปุ่ม "บันทึกเลย" ไม่ปิดระหว่างบันทึก ถ้าแตะสองครั้งก่อนเน็ตตอบ จะได้รายการซ้ำสองแถว และกระเป๋าเงินถูกหักสองรอบ ปุ่มอยู่สองที่:
- `components/home.tsx` ปุ่ม `poster-action` ใน `DueSoonRail`
- `components/upcoming.tsx` ปุ่ม `upcoming-action primary`

**ทำ**:
1. ใน `app/page.tsx` เพิ่ม state ชุดของบิลที่กำลังบันทึก (key = `recurring.id` + วันที่รอบบิล) ให้ `logRecurringNow` เช็คก่อนเริ่ม ถ้า key นี้กำลังบันทึกอยู่ให้ return ทันที แล้วล้าง key ใน `finally`
   - ต้องกันที่ฟังก์ชันด้วย ไม่ใช่แค่ปิดปุ่ม เพราะ state ของปุ่มอัปเดตไม่ทันการแตะเร็วๆ ให้ใช้ `useRef<Set<string>>` เป็นตัวกันจริง และใช้ state แยกไว้วาดปุ่มเท่านั้น
2. ส่งชุดนั้นลงไปเป็น prop (เช่น `loggingKeys: ReadonlySet<string>`) ให้ปุ่มทั้งสองที่ใส่ `disabled` และเปลี่ยนข้อความเป็น "กำลังบันทึก..." ระหว่างรอ
3. ไล่เช็คทางบันทึกอื่นที่ถูกเรียกจากปุ่มเดียวแล้ว insert ทันที ใช้หลักเดียวกันถ้ายังไม่มีตัวกัน:
   - `reconcileWallet`: ต้องตั้ง `busy` จริงระหว่าง insert หรือเปล่า (`ReconcileSheet` ปิดปุ่มด้วย `busy` อยู่แล้ว)
   - `settleDebtor`: หลังกดยืนยันใน confirm dialog แล้ว ปุ่ม "ปิดยอด" (`debtor-settle-button`) ยังกดซ้ำได้หรือไม่
   - งานนี้ให้ตรวจแล้วรายงาน แก้เฉพาะจุดที่เห็นชัดว่ากดซ้ำแล้ว insert ซ้ำได้
4. ถ้าแยกตรรกะ "key นี้กำลังทำอยู่ไหม" เป็นฟังก์ชันล้วนได้ ให้ใส่ใน `lib/` พร้อมเทส (เช่น `lib/in-flight.ts`) ถ้าเหลือแค่ 3 บรรทัดก็ไม่ต้องแยก

**ห้าม**: เปลี่ยนรูปแบบ id ของรายการ หรือกันซ้ำด้วยการเทียบชื่อ/ยอด (รายการชื่อเดียวกันวันเดียวกันเกิดขึ้นได้จริง)

**e2e**: ไม่ต้องเขียน spec ที่กดบันทึก (เทสไม่มี Supabase การบันทึกจึงไม่ทำงาน ตาม CLAUDE.md)

---

## งาน B: ส่งออกข้อมูลทั้งบัญชีเป็น JSON (ข้อ 4)

**ปัญหา**: ตอนนี้ส่งออกได้แค่ CSV รายงานรายการเงิน (`components/sheets.tsx` `ReportView` + `lib/csv.ts`) แต่นโยบายความเป็นส่วนตัวบอกว่า "ดาวน์โหลดข้อมูลของคุณ" ได้ ขณะที่การลบบัญชีลบถาวร เจ้าของเลือกแล้วว่า **ทำแค่ JSON**

**ทำ**:
1. สร้าง `lib/account-export.ts` (ฟังก์ชันล้วน + เทส `lib/account-export.test.ts`):
   - `buildAccountExport(data, meta)` คืน object:
     ```ts
     {
       app: APP_NAME, format: "nubmon-account-export", version: 1,
       exportedAt: string /* ISO */, userEmail: string | null,
       tables: { transactions: [...], wallets: [...], debtors: [...], recurring_expenses: [...],
                 investments: [...], investment_prices: [...], budgets: [...], money_goals: [...],
                 pocket_cards: [...], profiles: [...] }
     }
     ```
   - ชื่อ key ใน `tables` ใช้ค่าจาก `TABLES` (`lib/constants.ts`) ห้ามพิมพ์ชื่อตารางเอง
   - **ไม่ใส่** `pin_hash`, `pin_salt`, `webauthn_*` หรือคอลัมน์กุญแจใดๆ ของ `profiles` ให้กรองด้วย allowlist (ระบุคอลัมน์ที่ "ใส่ได้") ไม่ใช่ blocklist เพราะถ้ามีคอลัมน์ลับเพิ่มทีหลัง allowlist จะไม่ส่งออกไปเอง เทสต้องยืนยันว่าไม่มีคีย์ pin/webauthn หลุดออกไป
   - ไม่ใส่ `ai_chat_messages`, `privacy_acknowledgements` และ `ai_usage`
2. ดึงข้อมูล **ใหม่จาก Supabase ตอนกดส่งออก** ด้วยคอลัมน์ทั้งหมด (`select("*")`) ไม่ใช่เอา state ในจอมาใช้ เพราะ state ถูกแปลงรูปไปแล้ว และบางตารางมีคอลัมน์ที่ไม่ได้โหลดมาไว้ในจอ
   - ดึงแบบแบ่งหน้าเหมือน `loadEntries` (รายการอาจเกิน 1,000 แถว) ใช้ `ENTRY_PAGE_SIZE`/`ENTRY_PAGE_MAX_REQUESTS` ที่มีอยู่
   - ถ้าตารางไหนอ่านไม่สำเร็จ **ต้องไม่ดาวน์โหลดไฟล์ครึ่งๆ กลางๆ** ให้แสดง error แล้วจบ (ยกเว้น `pocket_cards` ที่ยังไม่มีตาราง ให้ถือเป็นว่างเหมือน `loadPocketCards`)
   - ตัวดึงที่ต้องคุยกับ Supabase วางใน `lib/account-export.ts` แบบรับ `SupabaseClient` เป็นพารามิเตอร์ เทสด้วย fake client แบบ `lib/privacy.test.ts`
3. ดาวน์โหลดเป็นไฟล์ `nubmon-backup-YYYY-MM-DD.json` (วันที่ตามเวลาไทย) ใช้ Blob + ลิงก์ชั่วคราวแบบ `downloadCsv` ใน `lib/csv.ts` ถ้าจะใช้ซ้ำให้แยกเป็น `downloadFile(name, text, mime)` แล้วให้ `downloadCsv` เรียกใช้
4. ปุ่มในแอป:
   - หน้า "ส่งออกรีพอร์ท" (`ReportView`): เพิ่มส่วน "สำรองข้อมูลทั้งบัญชี" ใต้รายงาน CSV มีคำอธิบาย 1 บรรทัดและปุ่ม "ดาวน์โหลดไฟล์สำรอง (JSON)" พร้อมสถานะ "กำลังเตรียมไฟล์..."
   - `ConfirmDeleteAccount` (`components/sheets.tsx`): ข้อความเดิมชี้ไปที่ CSV ให้เปลี่ยนเป็นปุ่มรอง "ดาวน์โหลดไฟล์สำรองก่อน" ที่เรียกตัวเดียวกัน ห้ามบังคับให้ดาวน์โหลดก่อนลบ
5. นโยบายความเป็นส่วนตัว (`components/privacy.tsx`) บรรทัด "ดาวน์โหลดข้อมูลของคุณเป็นไฟล์ CSV…" ให้แก้ให้ตรงกับที่ทำได้จริง (CSV รายงาน + JSON ทั้งบัญชี) ไม่ต้องเปลี่ยน `PRIVACY_POLICY_VERSION` เพราะเป็นการเพิ่มสิทธิ์ ไม่ได้เปลี่ยนการเก็บข้อมูล
6. หน้าตา: ใช้ class ปุ่มที่มีอยู่ในหน้านั้น ห้ามสร้างสีหรือขนาดใหม่ (`verify:design` จะจับ)

**ยังไม่ทำ**: นำเข้าหรือกู้คืนจากไฟล์ (เป็นงานแยกในอนาคต แต่ให้ใส่ `format`/`version` ไว้เผื่อ)

---

## งาน C: ติ๊กวาดเส้นใน toast สำเร็จ (ข้อ 7)

**ที่อยู่**: `ToastHost` ใน `components/primitives.tsx` วาดไอคอน `<Check />` ของ lucide เมื่อ `tone === "success"`

**ทำ**:
1. ทำให้เส้นติ๊กค่อยๆ วาดตอน toast ขึ้น ด้วย `stroke-dasharray`/`stroke-dashoffset` บน `path`/`polyline` ภายใน svg ของ lucide (เขียน CSS เล็งที่ `.toast.success svg path` หรือ selector ที่ตรงกว่า ตรวจใน DevTools ว่า lucide v1 วาดเป็น element อะไร)
2. ระยะเวลาและ easing ใช้ token `--t-*`/`--e-*` ที่มีอยู่ เริ่มหลังกล่อง toast ขึ้นเล็กน้อย (`animation-delay` จาก token เช่นกัน) และทั้งหมดต้องจบไม่เกิน ~400ms
3. `prefers-reduced-motion: reduce` ให้ติ๊กขึ้นเต็มทันที ไม่มีอนิเมชัน (ดูวิธีที่ไฟล์นี้ใช้กับ reduced-motion อยู่แล้ว)
4. เพิ่ม `@keyframes` ใหม่ไว้กลุ่มเดียวกับ keyframes อื่นใน `app/globals.css` (แถว `toast-in`) แก้ selector เดิมของ `.toast` ในที่เดิม ห้ามเพิ่ม rule ซ้ำท้ายไฟล์
5. ห้ามใส่วงเรืองแสง ประกาย หรือเอฟเฟกต์ตกแต่งอื่น (CLAUDE.md: No mascot / no sparkle)

---

## รายงานตอนส่ง

เขียนไว้ท้ายไฟล์นี้ในหัวข้อ "ผลการทำ (Sonnet)":
- commit แต่ละก้อนทำอะไร
- ผลคำสั่งตรวจงานทั้ง 5 ตัว
- งาน A ข้อ 3: แต่ละจุดเจออะไร แก้หรือไม่แก้ เพราะอะไร
- จุดที่ไม่แน่ใจ หรือทำต่างจากคำสั่ง พร้อมเหตุผล

แล้ว push branch ห้าม merge เอง
