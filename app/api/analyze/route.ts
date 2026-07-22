import { GoogleGenAI } from "@google/genai";

const schema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string", description: "ชื่อรายการสั้น กระชับ เป็นภาษาไทย" },
      category: { type: "string", enum: ["อาหาร", "เดินทาง", "ของใช้", "ที่อยู่อาศัย", "สุขภาพ", "บันเทิง", "รายได้", "อื่น ๆ"] },
      amount: { type: "number", minimum: 0 },
      type: { type: "string", enum: ["income", "expense"] },
      date: { type: "string", description: "วันที่รูปแบบ YYYY-MM-DD" },
    },
    required: ["title", "category", "amount", "type", "date"],
    additionalProperties: false,
  },
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" }, { status: 503 });
  const body = await request.json() as { text?: string; timezone?: string };
  const input = body.text?.trim();
  if (!input || input.length > 2000) return Response.json({ error: "ข้อความไม่ถูกต้อง" }, { status: 400 });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: body.timezone || "Asia/Bangkok" }).format(new Date());
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.interactions.create({
      model: "gemini-3.5-flash",
      input: `วันนี้คือ ${today} แยกรายรับรายจ่ายจากข้อความต่อไปนี้ ห้ามสร้างข้อมูลที่ไม่มีในข้อความ หากไม่ได้ระบุวันที่ให้ใช้วันนี้: ${input}`,
      response_format: { type: "text", mime_type: "application/json", schema },
    });
    return Response.json({ items: JSON.parse(response.output_text || "[]") });
  } catch (error) {
    console.error("Gemini analyze failed", error);
    return Response.json({ error: "AI วิเคราะห์รายการไม่สำเร็จ กรุณาลองใหม่" }, { status: 502 });
  }
}
