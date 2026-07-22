import { GoogleGenAI } from "@google/genai";

const transactionTypes = ["income", "personal_expense", "lend", "split_half", "debt_repayment", "gift"];
const categories = ["อาหาร", "เดินทาง", "ของใช้", "ที่อยู่อาศัย", "สุขภาพ", "บันเทิง", "รายได้", "บิลประจำ", "อื่น ๆ"];

const schema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "ชื่อรายการสั้น กระชับ เป็นภาษาไทย",
      },
      category: {
        type: "string",
        enum: categories,
      },
      amount: {
        type: "number",
        minimum: 0,
        description: "ยอดเงินเต็มจำนวนที่จ่ายหรือรับจริง",
      },
      transaction_type: {
        type: "string",
        enum: transactionTypes,
        description: "ชนิดธุรกรรมตาม logic ของกระเป๋าหลักและยอดค้างจากแฟน",
      },
      date: {
        type: "string",
        description: "วันที่รูปแบบ YYYY-MM-DD",
      },
      note: {
        type: "string",
        description: "คำอธิบายสั้น ๆ ถ้ามีบริบทสำคัญ",
      },
    },
    required: ["title", "category", "amount", "transaction_type", "date", "note"],
    additionalProperties: false,
  },
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" }, { status: 503 });

  const body = (await request.json()) as { text?: string; timezone?: string };
  const input = body.text?.trim();
  if (!input || input.length > 2000) return Response.json({ error: "ข้อความไม่ถูกต้อง" }, { status: 400 });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: body.timezone || "Asia/Bangkok" }).format(new Date());

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.interactions.create({
      model: "gemini-3.5-flash",
      input: [
        `วันนี้คือ ${today}`,
        "แยกรายรับรายจ่ายจากข้อความต่อไปนี้เป็น JSON เท่านั้น ห้ามสร้างรายการที่ไม่มีในข้อความ",
        "ถ้าไม่ระบุวันที่ ให้ใช้วันนี้",
        "",
        "กติกา transaction_type:",
        "- income = เงินเข้าบัญชี เช่น เงินเดือน รายรับ ตู้กดน้ำ",
        "- personal_expense = จ่ายเองส่วนตัว 100%",
        "- lend = ออกให้แฟนก่อน/ให้ยืม/จ่ายแทนแฟน 100%",
        "- split_half = หารกับแฟน/หารครึ่ง/คนละครึ่ง ให้ amount เป็นยอดเต็มที่ผู้ใช้จ่ายจริง",
        "- debt_repayment = แฟนคืนเงิน/โอนคืน/เคลียร์ยอด",
        "- gift = เลี้ยงแฟน/เปย์แฟน/จ่ายให้โดยไม่คิดคืน",
        "",
        "ถ้าข้อความมีคำว่า หารกับแฟน, หารครึ่ง, คนละครึ่ง ให้เลือก split_half",
        "ถ้าข้อความมีคำว่า ออกให้ก่อน, จ่ายแทน, ให้ยืม ให้เลือก lend",
        "ถ้าข้อความมีคำว่า คืนเงิน, โอนคืน, เคลียร์ยอด ให้เลือก debt_repayment",
        "ถ้าข้อความมีคำว่า เลี้ยงแฟน, เปย์แฟน, ไม่ต้องคืน ให้เลือก gift",
        "",
        `ข้อความ: ${input}`,
      ].join("\n"),
      response_format: { type: "text", mime_type: "application/json", schema },
    });

    return Response.json({ items: JSON.parse(response.output_text || "[]") });
  } catch (error) {
    console.error("Gemini analyze failed", error);
    return Response.json({ error: "AI วิเคราะห์รายการไม่สำเร็จ กรุณาลองใหม่" }, { status: 502 });
  }
}
