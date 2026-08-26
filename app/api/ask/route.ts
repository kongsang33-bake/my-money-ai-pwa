import { createGeminiClient, generateGeminiContent, getGeminiApiKey, missingGeminiKeyResponse } from "@/lib/gemini";
import { requireUser, unauthorizedResponse } from "@/lib/auth";

type ChatTurn = { role: "user" | "assistant"; content: string };

type AskBody = {
  question?: string;
  context?: Record<string, unknown>;
  history?: ChatTurn[];
};

// How many prior turns to replay to Gemini per request. Bounds token cost/
// latency on a long-running chat; older turns just drop off, no summarization.
const MAX_HISTORY_TURNS = 10;

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return unauthorizedResponse();

  const apiKey = getGeminiApiKey();
  if (!apiKey) return missingGeminiKeyResponse();
  const body = (await request.json()) as AskBody;
  const question = body.question?.trim() ?? "";
  if (!question) return Response.json({ error: "กรุณาพิมพ์คำถามก่อน" }, { status: 400 });
  if (question.length > 500) return Response.json({ error: "คำถามยาวเกินไป" }, { status: 400 });

  const history = Array.isArray(body.history)
    ? body.history.filter((turn): turn is ChatTurn => (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string").slice(-MAX_HISTORY_TURNS)
    : [];

  const systemPrompt = [
    "คุณคือผู้ช่วยการเงินส่วนตัว ตอบเป็นภาษาไทยที่เข้าใจง่าย กระชับ และอิงจากข้อมูลที่ให้เท่านั้น",
    "ข้อมูลสรุปที่ระบุด้านล่างเป็นตัวเลขอ้างอิงที่แอปคำนวณแล้วและต้องใช้ตามนั้นทุกหลัก ห้ามคำนวณทับหรือเปลี่ยนตัวเลขเหล่านี้",
    "ห้ามแต่งตัวเลขหรือธุรกรรมขึ้นมาเอง ถ้าข้อมูลไม่พอให้บอกตรง ๆ และเสนอว่าต้องมีข้อมูลอะไรเพิ่ม",
    "อย่าให้คำแนะนำการลงทุนหรือสินเชื่อแบบฟันธง ให้ใช้ถ้อยคำระมัดระวัง",
    "ตอบเป็นข้อความภาษาไทยธรรมดาสำหรับผู้ใช้ทั่วไป: ห้ามตอบเป็น JSON, code block, Markdown table, หรือแสดงชื่อฟิลด์/ตัวแปรภาษาอังกฤษ เช่น cashAvailable, walletBalance, netWorth. ให้แปลความหมายของข้อมูลเหล่านั้นเป็นคำไทยแทน.",
    `ข้อมูลอ้างอิงจากแอป: ${JSON.stringify(body.context ?? {})}`,
    "เมื่อพูดถึงยอดเงิน ให้ระบุชื่อยอดให้ชัด: cashAvailable คือยอดเงินสด/กระเป๋าเงินหลัก, walletBalance คือยอดรวมทุกกระเป๋า, balance คือรายรับลบรายจ่ายในรอบที่แสดง และ netWorth คือมูลค่าสุทธิรวมลูกหนี้และหนี้.",
    "ถ้าคำถามล่าสุดอ้างอิงถึงบทสนทนาก่อนหน้า (เช่น \"แล้วเดือนก่อนล่ะ\") ให้ใช้บริบทจากข้อความก่อนหน้าในการตอบ",
  ].join("\n\n");

  const contents = [
    { role: "user" as const, parts: [{ text: systemPrompt }] },
    { role: "model" as const, parts: [{ text: "รับทราบ พร้อมตอบคำถามการเงินตามข้อมูลที่ให้ครับ" }] },
    ...history.map((turn) => ({ role: turn.role === "user" ? ("user" as const) : ("model" as const), parts: [{ text: turn.content }] })),
    { role: "user" as const, parts: [{ text: question }] },
  ];

  try {
    const ai = createGeminiClient(apiKey);
    const response = await generateGeminiContent(ai, { contents, config: { temperature: 0.2 } });
    return Response.json({ answer: response.text?.trim() || "ยังไม่มีคำตอบ" });
  } catch (error) {
    console.error("Gemini ask failed", error);
    return Response.json({ error: "AI ตอบคำถามไม่สำเร็จ กรุณาลองใหม่" }, { status: 502 });
  }
}
