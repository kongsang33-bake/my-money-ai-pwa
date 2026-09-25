import { APP_NAME, PRIVACY_CONTACT_EMAIL, PRIVACY_POLICY_VERSION } from "@/lib/constants";

// The one copy of the privacy policy. /privacy renders it as a page (a URL to
// hand Google's OAuth consent screen, and the link under "ของฉัน"), and the
// landing page opens it in a sheet that ends in "รับทราบ" -- so what someone
// acknowledges before signing in is exactly what the page says.
//
// Every claim here is something the code does today. Check it against the
// code before editing, and bump PRIVACY_POLICY_VERSION when the substance
// changes so the acknowledgement is asked for again.

const updatedLabel = new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" })
  .format(new Date(`${PRIVACY_POLICY_VERSION}T00:00:00+07:00`));

export function PrivacyPolicyContent() {
  return (
    <div className="privacy-policy">
      <p className="privacy-updated">ปรับปรุงล่าสุด {updatedLabel}</p>
      <p>
        {APP_NAME} เป็นแอพจดรายรับรายจ่ายส่วนตัว หน้านี้บอกว่าเราเก็บข้อมูลอะไร ใช้ทำอะไร
        ส่งให้ใครบ้าง และคุณจัดการข้อมูลของตัวเองได้อย่างไร ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
      </p>

      <section>
        <h2>ผู้ควบคุมข้อมูล</h2>
        <p>
          ผู้พัฒนา {APP_NAME} เป็นผู้ควบคุมข้อมูลส่วนบุคคลของคุณ ติดต่อได้ที่{" "}
          <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>
        </p>
      </section>

      <section>
        <h2>ข้อมูลที่เก็บ</h2>
        <ul>
          <li><b>บัญชี</b> อีเมล ชื่อ และรูปโปรไฟล์ที่ได้จาก Google หรือจากอีเมลที่ใช้เข้าระบบ</li>
          <li><b>ข้อมูลการเงินที่คุณจดเอง</b> รายการรายรับรายจ่าย กระเป๋าเงิน หนี้และคนที่ยืม บิลประจำ งบ เป้าหมาย และพอร์ตลงทุน</li>
          <li><b>การตั้งค่า</b> ชื่อที่แสดง วันเริ่มรอบเดือน และบริบทที่คุณเขียนให้ AI</li>
          <li><b>ตัวล็อก</b> PIN เก็บเป็นค่า hash (PBKDF2) ไม่ใช่ตัวเลขจริง ส่วน Face ID เก็บแค่กุญแจสาธารณะของเครื่อง ข้อมูลใบหน้าไม่เคยออกจากเครื่องของคุณ</li>
          <li><b>การรับทราบนโยบายนี้</b> ฉบับของนโยบาย เวลาที่กดรับทราบ และชนิดของเบราว์เซอร์ที่ใช้ เก็บไว้เป็นหลักฐานกับบัญชีของคุณ</li>
          <li><b>ประวัติแชทกับ AI</b> คำถามและคำตอบในหน้า &ldquo;ถาม AI เรื่องเงิน&rdquo;</li>
        </ul>
        <p>รูปสลิปที่แนบมีไว้ให้ AI อ่านเท่านั้น แอพไม่ได้เก็บรูปไว้</p>
      </section>

      <section>
        <h2>ใช้ข้อมูลทำอะไร</h2>
        <p>
          ใช้แสดงและคำนวณยอดเงินในแอพให้คุณเท่านั้น ซึ่งเป็นการใช้เพื่อให้บริการตามที่คุณขอ
          ไม่มีโฆษณา ไม่มีตัวติดตามพฤติกรรม
          และไม่ขายหรือแบ่งปันข้อมูลให้ใครเพื่อการตลาด
        </p>
      </section>

      <section>
        <h2>ผู้ให้บริการที่ได้รับข้อมูล</h2>
        <ul>
          <li><b>Supabase</b> ฐานข้อมูลและระบบเข้าสู่ระบบ ข้อมูลทั้งหมดของคุณเก็บที่นี่</li>
          <li><b>Google</b> ใช้ยืนยันตัวตนเมื่อคุณเลือกเข้าด้วย Google</li>
          <li>
            <b>Google Gemini</b> เมื่อคุณใช้ AI จดรายการ แนบสลิป หรือถามคำถาม ข้อความหรือรูปนั้น
            พร้อมสรุปข้อมูลในแอพที่ AI ต้องใช้ตอบ จะถูกส่งไปประมวลผล และจะส่งเฉพาะตอนที่คุณใช้ฟีเจอร์นั้น
          </li>
        </ul>
        <p>
          ฐานข้อมูลตั้งอยู่ที่สิงคโปร์ ส่วน Google อาจประมวลผลบนเซิร์ฟเวอร์นอกประเทศไทย
          การใช้แอพจึงรวมถึงการส่งข้อมูลไปต่างประเทศเพื่อให้บริการนี้
        </p>
      </section>

      <section>
        <h2>การปกป้องข้อมูล</h2>
        <ul>
          <li>ทุกตารางในฐานข้อมูลเปิด Row Level Security ข้อมูลแต่ละแถวผูกกับบัญชีของคุณ บัญชีอื่นอ่านหรือแก้ไม่ได้</li>
          <li>รับส่งข้อมูลผ่าน HTTPS ทั้งหมด</li>
          <li>แอพไม่เห็นและไม่เก็บรหัสผ่านของคุณ การเข้าระบบทำผ่าน Google หรือลิงก์ทางอีเมล</li>
        </ul>
      </section>

      <section>
        <h2>เก็บไว้นานแค่ไหน</h2>
        <p>
          เก็บไว้ตราบเท่าที่บัญชีของคุณยังอยู่ เมื่อคุณลบบัญชี ข้อมูลทั้งหมดของบัญชีนั้น
          รวมถึงบันทึกการรับทราบนโยบาย จะถูกลบไปด้วย รายการที่คุณลบเองในแอพจะหายไปทันที
        </p>
      </section>

      <section>
        <h2>สิทธิ์ของคุณ</h2>
        <p>
          คุณมีสิทธิ์ขอดู ขอสำเนา ขอแก้ไข ขอลบ ขอระงับหรือคัดค้านการใช้ข้อมูลของคุณ
          และร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลได้
        </p>
        <ul>
          <li>ดู แก้ และลบรายการของคุณได้เองในแอพทุกเมื่อ</li>
          <li>ดาวน์โหลดข้อมูลของคุณเป็นไฟล์ CSV ได้ที่ &ldquo;ของฉัน&rdquo; → &ldquo;ส่งออกรีพอร์ท&rdquo;</li>
          <li>
            ลบบัญชีและข้อมูลทั้งหมดได้เองที่ &ldquo;ของฉัน&rdquo; → &ldquo;ลบบัญชี&rdquo;
          </li>
          <li>
            ถ้าต้องการใช้สิทธิ์อื่น หรือมีคำถามเรื่องข้อมูลส่วนตัว อีเมลถึงผู้พัฒนาที่{" "}
            <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>
          </li>
        </ul>
      </section>

      <section>
        <h2>เมื่อนโยบายเปลี่ยน</h2>
        <p>
          ถ้าเนื้อหาของนโยบายนี้เปลี่ยน แอพจะขอให้คุณอ่านและกดรับทราบอีกครั้งก่อนใช้งานต่อ
        </p>
      </section>
    </div>
  );
}
