import { GoogleGenAI } from "@google/genai";

type AskBody = {
  question?: string;
  entries?: Array<Record<string, unknown>>;
  wallets?: Array<Record<string, unknown>>;
  debtors?: Array<Record<string, unknown>>;
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" }, { status: 503 });
  const body = (await request.json()) as AskBody;
  const question = body.question?.trim() ?? "";
  if (!question) return Response.json({ error: "กรุณาพิมพ์คำถามก่อน" }, { status: 400 });
  if (question.length > 500) return Response.json({ error: "คำถามยาวเกินไป" }, { status: 400 });

  const prompt = [
    "คุณคือผู้ช่วยการเงินส่วนตัว ตอบเป็นภาษาไทยที่เข้าใจง่าย กระชับ และอิงจากข้อมูลที่ให้เท่านั้น",
    "ห้ามแต่งตัวเลขหรือธุรกรรมขึ้นมาเอง ถ้าข้อมูลไม่พอให้บอกตรง ๆ และเสนอว่าต้องมีข้อมูลอะไรเพิ่ม",
    "อย่าให้คำแนะนำการลงทุนหรือสินเชื่อแบบฟันธง ให้ใช้ถ้อยคำระมัดระวัง",
    `คำถามของผู้ใช้: ${question}`,
    `รายการธุรกรรมล่าสุด (อาจมีเฉพาะ 300 รายการ): ${JSON.stringify(body.entries ?? [])}`,
    `กระเป๋าเงิน: ${JSON.stringify(body.wallets ?? [])}`,
    `ลูกหนี้และหนี้: ${JSON.stringify(body.debtors ?? [])}`,
  ].join("\n\n");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model: "gemini-flash-latest", contents: [{ text: prompt }], config: { temperature: 0.2 } });
    return Response.json({ answer: response.text?.trim() || "ยังไม่มีคำตอบ" });
  } catch (error) {
    console.error("Gemini ask failed", error);
    return Response.json({ error: "AI ตอบคำถามไม่สำเร็จ กรุณาลองใหม่" }, { status: 502 });
  }
}
