import { GoogleGenAI } from "@google/genai";

const transactionTypes = ["income", "personal_expense", "lend", "split_half", "debt_repayment", "gift"] as const;
const categories = ["อาหาร", "เดินทาง", "ของใช้", "ที่อยู่อาศัย", "สุขภาพ", "บันเทิง", "รายได้", "บิลประจำ", "อื่น ๆ"] as const;

const schema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string", description: "ชื่อรายการสั้น กระชับ เป็นภาษาไทย" },
      category: { type: "string", enum: categories },
      amount: { type: "number", minimum: 0, description: "ยอดเงินเต็มจำนวนที่จ่ายหรือรับจริง" },
      transaction_type: {
        type: "string",
        enum: transactionTypes,
        description: "ชนิดธุรกรรมตาม logic กระเป๋าหลักและยอดลูกหนี้",
      },
      debtor_name: {
        type: "string",
        description: "ชื่อบุคคลที่เป็นลูกหนี้ เช่น แฟน เพื่อนเอ คุณบี ถ้าไม่พบให้ใช้ ไม่ระบุ",
      },
      date: { type: "string", description: "วันที่รูปแบบ YYYY-MM-DD" },
      note: { type: "string", description: "คำอธิบายสั้น ๆ ถ้ามีบริบทสำคัญ" },
    },
    required: ["title", "category", "amount", "transaction_type", "debtor_name", "date", "note"],
    additionalProperties: false,
  },
};

type AnalyzeImage = {
  data: string;
  mimeType: string;
  name?: string;
};

type AnalyzeBody = {
  text?: string;
  timezone?: string;
  images?: AnalyzeImage[];
  debtorNames?: string[];
};

const maxImageBytes = 5 * 1024 * 1024;

function imageBytes(base64: string) {
  return Math.floor((base64.length * 3) / 4);
}

function buildPrompt(input: string, today: string, hasImages: boolean, debtorNames: string[]) {
  const knownDebtors = debtorNames.length ? debtorNames.join(", ") : "ยังไม่มีรายชื่อลูกหนี้ที่บันทึกไว้";
  return [
    `วันนี้คือ ${today}`,
    "แยกรายรับรายจ่ายจากข้อความและ/หรือรูปสลิปเป็น JSON เท่านั้น ห้ามสร้างรายการที่ไม่มีหลักฐานในข้อความหรือรูป",
    "ถ้าไม่ระบุวันที่ ให้ใช้วันนี้ ถ้ารูปสลิปมีวันที่ ให้ใช้วันที่บนสลิป",
    hasImages
      ? "ถ้ามีรูปสลิป ให้อ่านชื่อร้าน/ผู้รับเงิน ยอดเงิน วันที่ เวลา และข้อความอ้างอิงจากรูป แล้วแปลงเป็นรายการเดียวหรือหลายรายการตามที่เห็นจริง"
      : "ไม่มีรูปแนบ ให้วิเคราะห์จากข้อความเท่านั้น",
    "",
    "หมวดหมู่ที่อนุญาต: อาหาร, เดินทาง, ของใช้, ที่อยู่อาศัย, สุขภาพ, บันเทิง, รายได้, บิลประจำ, อื่น ๆ",
    "",
    "กติกา transaction_type:",
    "- income = เงินเข้าบัญชี เช่น เงินเดือน รายรับ ตู้กดน้ำขายได้",
    "- personal_expense = จ่ายเองส่วนตัว 100%",
    "- lend = ออกเงินให้บุคคลอื่นก่อน/ให้ยืม/จ่ายแทน 100%",
    "- split_half = หารกับบุคคลอื่น/หารครึ่ง/คนละครึ่ง ให้ amount เป็นยอดเต็มที่ผู้ใช้จ่ายจริง",
    "- debt_repayment = บุคคลอื่นคืนเงิน/โอนคืน/เคลียร์ยอด",
    "- gift = เลี้ยงหรือให้โดยไม่คิดคืน",
    "",
    "กติกา debtor_name:",
    "- ใช้เฉพาะรายการ lend, split_half, debt_repayment",
    `- รายชื่อลูกหนี้ที่มีอยู่ในระบบ: ${knownDebtors}`,
    "- ถ้าข้อความใกล้เคียงกับรายชื่อที่มีอยู่ ให้ใช้ชื่อจากระบบให้ตรงที่สุด",
    "- ถ้าพบชื่อใหม่ เช่น แฟน, เพื่อนเอ, คุณบี และไม่ตรงกับรายชื่อเดิม ให้คืนชื่อใหม่นั้นเพื่อให้แอพเสนอสร้างลูกหนี้ใหม่",
    "- ถ้ามีคำว่าออกให้เพื่อนก่อนแต่ไม่ระบุชื่อ ให้ใช้ เพื่อน",
    "- ถ้าไม่พบชื่อ ให้ใช้ ไม่ระบุ",
    "- รายรับ/รายจ่ายส่วนตัวให้ใช้ ไม่ระบุ",
    "",
    `ข้อความจากผู้ใช้: ${input || "(ไม่มีข้อความ ผู้ใช้แนบรูปอย่างเดียว)"}`,
  ].join("\n");
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" }, { status: 503 });

  const body = (await request.json()) as AnalyzeBody;
  const input = body.text?.trim() ?? "";
  const images = body.images ?? [];
  const debtorNames = [...new Set((body.debtorNames ?? []).map((name) => name.trim()).filter(Boolean))].slice(0, 100);

  if (!input && images.length === 0) return Response.json({ error: "กรุณาพิมพ์ข้อความหรือแนบรูปสลิปก่อน" }, { status: 400 });
  if (input.length > 2000) return Response.json({ error: "ข้อความยาวเกินไป" }, { status: 400 });
  if (images.length > 3) return Response.json({ error: "แนบรูปได้สูงสุด 3 รูปต่อครั้ง" }, { status: 400 });

  for (const image of images) {
    if (!image.mimeType.startsWith("image/")) return Response.json({ error: "รองรับเฉพาะไฟล์รูปภาพเท่านั้น" }, { status: 400 });
    if (imageBytes(image.data) > maxImageBytes) return Response.json({ error: "รูปภาพต้องมีขนาดไม่เกิน 5MB ต่อรูป" }, { status: 400 });
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: body.timezone || "Asia/Bangkok" }).format(new Date());
  const prompt = buildPrompt(input, today, images.length > 0, debtorNames);

  let response;
  try {
    const ai = new GoogleGenAI({ apiKey });
    response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [
        { text: prompt },
        ...images.map((image) => ({
          inlineData: {
            data: image.data,
            mimeType: image.mimeType,
          },
        })),
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.1,
      },
    });
  } catch (error) {
    console.error("Gemini analyze failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `AI วิเคราะห์รายการไม่สำเร็จ: ${detail}` }, { status: 502 });
  }

  try {
    return Response.json({ items: JSON.parse(response.text || "[]") });
  } catch (error) {
    console.error("Gemini analyze: could not parse response as JSON", error, response.text);
    return Response.json({ error: "AI ส่งข้อมูลกลับมาในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่" }, { status: 502 });
  }
}
