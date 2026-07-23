import { GoogleGenAI } from "@google/genai";

const transactionTypes = ["income", "personal_expense", "lend", "split_half", "debt_repayment", "debt_payment", "gift"] as const;
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

type AnalyzeDebtor = {
  name: string;
  kind: "lend" | "own";
};

type AnalyzeBody = {
  text?: string;
  timezone?: string;
  defaultDate?: string;
  images?: AnalyzeImage[];
  debtors?: AnalyzeDebtor[];
};

const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/;

const maxImageBytes = 5 * 1024 * 1024;

function imageBytes(base64: string) {
  return Math.floor((base64.length * 3) / 4);
}

function buildPrompt(input: string, today: string, hasImages: boolean, debtors: AnalyzeDebtor[]) {
  const lendNames = debtors.filter((debtor) => debtor.kind === "lend").map((debtor) => debtor.name);
  const ownNames = debtors.filter((debtor) => debtor.kind === "own").map((debtor) => debtor.name);
  const knownDebtors = lendNames.length ? lendNames.join(", ") : "ยังไม่มีรายชื่อลูกหนี้ที่บันทึกไว้";
  const knownOwnDebts = ownNames.length ? ownNames.join(", ") : "ยังไม่มีรายการหนี้ของฉันที่บันทึกไว้";
  return [
    `วันที่กำลังบันทึกรายการนี้คือ ${today}`,
    "แยกรายรับรายจ่ายจากข้อความและ/หรือรูปสลิปเป็น JSON เท่านั้น ห้ามสร้างรายการที่ไม่มีหลักฐานในข้อความหรือรูป",
    "ถ้าข้อความหรือรูปไม่ได้ระบุวันที่ไว้ชัดเจน ให้ใช้วันที่กำลังบันทึกด้านบน ถ้ารูปสลิปมีวันที่ ให้ใช้วันที่บนสลิปแทน",
    hasImages
      ? "ถ้ามีรูปสลิป ให้อ่านชื่อร้าน/ผู้รับเงิน รายการสินค้า ยอดเงิน วันที่ เวลา และข้อความอ้างอิงจากรูป"
      : "ไม่มีรูปแนบ ให้วิเคราะห์จากข้อความเท่านั้น",
    "",
    "หมวดหมู่ที่อนุญาต: อาหาร, เดินทาง, ของใช้, ที่อยู่อาศัย, สุขภาพ, บันเทิง, รายได้, บิลประจำ, อื่น ๆ",
    "",
    ...(hasImages
      ? [
          "กติกาสลิปที่มีหลายสินค้า:",
          "- ถ้าสลิปมีรายการสินค้าแยกบรรทัดพร้อมราคาต่อชิ้น ให้สร้างหนึ่งรายการต่อสินค้าหนึ่งบรรทัดเสมอ ห้ามรวมสินค้าหลายชิ้นเป็นรายการเดียว แม้จะอยู่หมวดหมู่เดียวกันก็ตาม",
          "- ตั้ง title ของแต่ละรายการตามชื่อสินค้านั้นจริง ๆ ตามที่พิมพ์บนสลิป ไม่ใช่ชื่อร้านหรือชื่อรวม",
          "- จัดหมวดหมู่ (category) ของแต่ละรายการแยกกันตามประเภทของสินค้านั้นเอง เช่น เครื่องดื่ม/ของกินให้เป็นอาหาร เครื่องเขียนหรือของใช้ทั่วไปให้เป็นของใช้",
          "- ยอดรวมของทุกรายการที่แยกจากสลิปเดียวกัน ต้องบวกกันได้เท่ากับยอดสุทธิที่ระบุบนสลิป",
          "",
        ]
      : []),
    "กติกา transaction_type:",
    "- income = เงินเข้าบัญชี เช่น เงินเดือน รายรับ ตู้กดน้ำขายได้",
    "- personal_expense = จ่ายเองส่วนตัว 100%",
    "- lend = ออกเงินให้บุคคลอื่นก่อน/ให้ยืม/จ่ายแทน 100%",
    "- split_half = หารกับบุคคลอื่น/หารครึ่ง/คนละครึ่ง ให้ amount เป็นยอดเต็มที่ผู้ใช้จ่ายจริง",
    "- debt_repayment = บุคคลอื่นคืนเงิน/โอนคืน/เคลียร์ยอด",
    "- debt_payment = ผ่อนชำระหนี้สินของผู้ใช้เอง (ไม่ใช่ให้คนอื่นยืม) เช่น ผ่อนบ้าน ผ่อนรถ จ่ายค่างวดบัตรเครดิต",
    "- gift = เลี้ยงหรือให้โดยไม่คิดคืน",
    "",
    "กติกา debtor_name:",
    "- ใช้เฉพาะรายการ lend, split_half, debt_repayment",
    `- รายชื่อลูกหนี้ (คนที่ติดเรา) ที่มีอยู่ในระบบ: ${knownDebtors}`,
    "- ถ้าข้อความใกล้เคียงกับรายชื่อที่มีอยู่ ให้ใช้ชื่อจากระบบให้ตรงที่สุด",
    "- ถ้าพบชื่อใหม่ เช่น แฟน, เพื่อนเอ, คุณบี และไม่ตรงกับรายชื่อเดิม ให้คืนชื่อใหม่นั้นเพื่อให้แอพเสนอสร้างลูกหนี้ใหม่",
    "- ถ้ามีคำว่าออกให้เพื่อนก่อนแต่ไม่ระบุชื่อ ให้ใช้ เพื่อน",
    "- ถ้าไม่พบชื่อ ให้ใช้ ไม่ระบุ",
    "- รายรับ/รายจ่ายส่วนตัวให้ใช้ ไม่ระบุ",
    "",
    "กติกา debtor_name สำหรับ debt_payment:",
    "- ใช้ debtor_name เป็นชื่อก้อนหนี้ของฉันเอง (เช่น บ้าน, รถ, บัตรเครดิต) ไม่ใช่ชื่อคน",
    `- รายชื่อหนี้ของฉันที่มีอยู่ในระบบ: ${knownOwnDebts}`,
    "- ถ้าใกล้เคียงชื่อที่มีอยู่ ให้ใช้ชื่อเดิม ถ้าไม่พบให้ตั้งชื่อใหม่สั้น ๆ เพื่อให้แอพสร้างรายการหนี้ให้อัตโนมัติ",
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
  const seen = new Set<string>();
  const debtors = (body.debtors ?? [])
    .map((debtor) => ({ name: debtor.name?.trim() ?? "", kind: debtor.kind }))
    .filter((debtor) => {
      if (!debtor.name || seen.has(debtor.name)) return false;
      seen.add(debtor.name);
      return true;
    })
    .slice(0, 100);

  if (!input && images.length === 0) return Response.json({ error: "กรุณาพิมพ์ข้อความหรือแนบรูปสลิปก่อน" }, { status: 400 });
  if (input.length > 2000) return Response.json({ error: "ข้อความยาวเกินไป" }, { status: 400 });
  if (images.length > 3) return Response.json({ error: "แนบรูปได้สูงสุด 3 รูปต่อครั้ง" }, { status: 400 });

  for (const image of images) {
    if (!image.mimeType.startsWith("image/")) return Response.json({ error: "รองรับเฉพาะไฟล์รูปภาพเท่านั้น" }, { status: 400 });
    if (imageBytes(image.data) > maxImageBytes) return Response.json({ error: "รูปภาพต้องมีขนาดไม่เกิน 5MB ต่อรูป" }, { status: 400 });
  }

  const today =
    body.defaultDate && dateInputPattern.test(body.defaultDate)
      ? body.defaultDate
      : new Intl.DateTimeFormat("en-CA", { timeZone: body.timezone || "Asia/Bangkok" }).format(new Date());
  const prompt = buildPrompt(input, today, images.length > 0, debtors);

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
