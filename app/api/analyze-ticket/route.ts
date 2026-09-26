import { createGeminiClient, describeGeminiError, generateGeminiContent, getGeminiApiKey, missingGeminiKeyResponse } from "@/lib/gemini";
import { requireUser, unauthorizedResponse } from "@/lib/auth";
import { DATE_INPUT_PATTERN, GEMINI_EXTRACTION_TEMPERATURE, GEMINI_IMAGE_TIMEOUT_MS, MAX_IMAGE_BYTES, imageBytes } from "@/lib/constants";
import { isGeneralPocketKind, normalizeTicketReading, type PocketCardKind } from "@/lib/pocket";

// Reads what is printed on a card or ticket the user photographed, for the
// card pocket's "ให้ AI ช่วยกรอก" (components/pocket.tsx). Only ever called
// when that button is pressed, and only for cards and tickets -- never for a
// PromptPay number or a bank account. The photo is sent to Gemini for this
// one reading and kept nowhere; what comes back fills blanks in the form,
// which the user checks before anything is saved.
//
// The model reads the ticket; it does not look anything up. A title or a time
// is what the print says, so the prompt forbids guessing and asks for an
// empty string instead.

const schema = {
  type: "object",
  properties: {
    label: { type: "string", description: "ชื่อสั้น ๆ ของบัตรหรือตั๋วนี้สำหรับตั้งเป็นชื่อการ์ด เช่น ชื่อหนัง ชื่องาน หรือชื่อบัตรสมาชิก" },
    issuer: { type: "string", description: "ผู้ออกบัตร ร้าน โรงหนัง หรือผู้จัดงาน ตามที่พิมพ์บนบัตร" },
    holder: { type: "string", description: "ชื่อผู้ถือบัตรถ้าพิมพ์ไว้ ถ้าไม่มีให้ส่งค่าว่าง" },
    title: { type: "string", description: "ชื่อเรื่องหนัง ชื่อคอนเสิร์ต หรือชื่องาน ถ้าไม่ใช่ตั๋วให้ส่งค่าว่าง" },
    venue: { type: "string", description: "สถานที่ สาขา โรง หรือฮอลล์ ตามที่พิมพ์" },
    starts_at: {
      type: "string",
      description: "วันเวลาเริ่มรูปแบบ YYYY-MM-DDTHH:mm (ปี ค.ศ. เวลา 24 ชั่วโมง) หรือ YYYY-MM-DD ถ้าไม่มีเวลา ถ้าไม่พบให้ส่งค่าว่าง",
    },
    seat: { type: "string", description: "ที่นั่ง แถว หรือโซน ถ้ามีหลายที่นั่งให้คั่นด้วยจุลภาค" },
    code_text: { type: "string", description: "ตัวเลขหรือตัวอักษรที่พิมพ์อยู่ใต้บาร์โค้ด ถ้าไม่มีบาร์โค้ดหรืออ่านไม่ชัดให้ส่งค่าว่าง" },
  },
  required: ["label", "issuer", "holder", "title", "venue", "starts_at", "seat", "code_text"],
  additionalProperties: false,
};

type TicketBody = {
  image?: { data?: string; mimeType?: string };
  kind?: PocketCardKind;
  today?: string;
};

const KIND_HINTS: Partial<Record<PocketCardKind, string>> = {
  ticket: "ตั๋วหนัง คอนเสิร์ต หรืออีเวนต์",
  membership: "บัตรสมาชิกหรือบัตรสะสมแต้ม",
  other: "บัตรทั่วไป",
};

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return unauthorizedResponse();

  const apiKey = getGeminiApiKey();
  if (!apiKey) return missingGeminiKeyResponse();

  const body = (await request.json()) as TicketBody;
  const image = body.image;
  if (!image?.data || !image.mimeType?.startsWith("image/")) return Response.json({ error: "กรุณาเลือกรูปบัตรหรือตั๋วก่อน" }, { status: 400 });
  if (imageBytes(image.data) > MAX_IMAGE_BYTES) return Response.json({ error: "รูปภาพต้องมีขนาดไม่เกิน 5MB" }, { status: 400 });
  // Ways to be paid are never read by AI, whatever the client sends.
  if (!body.kind || !isGeneralPocketKind(body.kind)) return Response.json({ error: "AI ช่วยกรอกได้เฉพาะบัตรและตั๋ว" }, { status: 400 });
  const today = body.today && DATE_INPUT_PATTERN.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);

  const prompt = [
    `อ่านข้อมูลที่พิมพ์อยู่บน${KIND_HINTS[body.kind]}ในรูปนี้ แล้วตอบเป็น JSON ตาม schema`,
    "กฎ:",
    "- ใช้เฉพาะข้อความที่เห็นในรูปจริง ห้ามเดาหรือเติมข้อมูลที่ไม่ได้พิมพ์ไว้ ถ้าไม่พบให้ส่งค่าว่าง",
    "- ห้ามใส่ข้อมูลบัตรเครดิต เลขบัตรประชาชน หรือรหัสผ่าน แม้จะเห็นในรูป",
    `- วันนี้คือ ${today} ถ้าบนตั๋วไม่มีปี ให้ใช้ปีที่ทำให้วันนั้นเป็นวันที่ใกล้ที่สุดที่ยังไม่ผ่านไป ถ้าเป็นปี พ.ศ. ให้แปลงเป็น ค.ศ.`,
    "- label ให้สั้นและอ่านรู้เรื่อง เช่น ชื่อหนัง หรือ ชื่อร้านตามด้วยคำว่าบัตรสมาชิก",
  ].join("\n");

  let response;
  try {
    const ai = createGeminiClient(apiKey);
    response = await generateGeminiContent(ai, {
      contents: [{ text: prompt }, { inlineData: { data: image.data, mimeType: image.mimeType } }],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: GEMINI_EXTRACTION_TEMPERATURE,
      },
    }, { timeoutMs: GEMINI_IMAGE_TIMEOUT_MS, thinking: "minimal" });
  } catch (error) {
    return Response.json({ error: describeGeminiError(error, "อ่านรายละเอียดบัตร") }, { status: 502 });
  }

  try {
    // Bounded and validated here as well as on the client, so a malformed
    // answer never reaches the form.
    const reading = normalizeTicketReading(JSON.parse(response.text || "{}"));
    return Response.json({
      reading: {
        label: reading.label,
        issuer: reading.issuer,
        holder: reading.holder,
        code_text: reading.codeText,
        title: reading.details.title ?? "",
        venue: reading.details.venue ?? "",
        starts_at: reading.details.startsAt ?? "",
        seat: reading.details.seat ?? "",
      },
    });
  } catch (error) {
    console.error("Gemini analyze-ticket: could not parse response as JSON", error, response.text);
    return Response.json({ error: "AI ส่งข้อมูลกลับมาในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่" }, { status: 502 });
  }
}
