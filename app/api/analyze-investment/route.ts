import { createGeminiClient, describeGeminiError, generateGeminiContent, getGeminiApiKey, missingGeminiKeyResponse } from "@/lib/gemini";
import { requireUser, unauthorizedResponse } from "@/lib/auth";
import { DATE_INPUT_PATTERN, DEFAULT_TIMEZONE, GEMINI_EXTRACTION_TEMPERATURE } from "@/lib/constants";

// A separate, deliberately small schema/prompt from /api/analyze — logging
// an investment purchase only ever needs an amount, which fund, which
// wallet to debit, and a date. Folding this into the general entry prompt
// would bloat it with rules that only matter for the rare investment case;
// keeping it a dedicated endpoint keeps both prompts easier to get right.
const itemSchema = {
  type: "object",
  properties: {
    investment_name: { type: "string", description: "ชื่อกองทุน/หุ้น/สินทรัพย์ที่ลงทุน ถ้าไม่ได้ระบุชื่อชัดเจนและมีกองทุนเดียวในระบบให้ใช้ชื่อนั้น ถ้าไม่ระบุและมีหลายกองให้ส่งค่าว่าง" },
    code: { type: "string", description: "รหัส/สัญลักษณ์กองทุนถ้ามีในข้อความ ไม่งั้นส่งค่าว่าง" },
    amount: { type: "number", minimum: 0, description: "จำนวนเงินที่จ่ายไปลงทุน รวมเศษสตางค์ทศนิยมได้ถึง 2 ตำแหน่ง ห้ามปัดเศษ" },
    date: { type: "string", description: "วันที่รูปแบบ YYYY-MM-DD" },
    wallet_id: { type: "string", description: "id ของกระเป๋าต้นทางที่ถูกหักเงิน ถ้าระบุไม่ได้ให้ส่งค่าว่าง" },
    note: { type: "string", description: "คำอธิบายสั้น ๆ ถ้ามีบริบทสำคัญ เช่น DCA รายเดือน" },
  },
  required: ["investment_name", "code", "amount", "date", "wallet_id", "note"],
  additionalProperties: false,
};

const schema = {
  type: "object",
  properties: {
    items: { type: "array", items: itemSchema },
  },
  required: ["items"],
  additionalProperties: false,
};

type AnalyzeInvestmentBody = {
  text?: string;
  timezone?: string;
  defaultDate?: string;
  investments?: { id: string; name: string; code: string | null }[];
  wallets?: { id: string; name: string; tag: string; is_default?: boolean }[];
};

function buildPrompt(input: string, today: string, investments: { id: string; name: string; code: string | null }[], wallets: { id: string; name: string; tag: string; is_default?: boolean }[]) {
  const knownInvestments = investments.length
    ? investments.map((item) => `${item.id} = ${item.name}${item.code ? ` (${item.code})` : ""}`).join(", ")
    : "ยังไม่มีกองทุน/สินทรัพย์ที่บันทึกไว้";
  const knownWallets = wallets.length
    ? wallets.map((wallet) => `${wallet.id} = ${wallet.name} (${wallet.tag}${wallet.is_default ? ", default" : ""})`).join(", ")
    : "ยังไม่มีกระเป๋าที่บันทึกไว้";
  return [
    `วันที่กำลังบันทึกรายการนี้คือ ${today}`,
    "แยกรายการ \"ลงทุน\"/\"DCA\"/\"ซื้อกองทุน\" จากข้อความเป็น JSON เท่านั้น ห้ามสร้างรายการที่ไม่มีหลักฐานในข้อความ",
    "ถ้าข้อความไม่ได้ระบุวันที่ไว้ชัดเจน ให้ใช้วันที่กำลังบันทึกด้านบน",
    "แต่ละข้อความมักมีรายการลงทุนแค่รายการเดียว แยกเป็นหลายรายการเฉพาะเมื่อพูดถึงหลายกองทุน/หลายจำนวนเงินชัดเจนเท่านั้น",
    "",
    "กติกา investment_name:",
    `- รายชื่อกองทุน/สินทรัพย์ที่มีอยู่ในระบบ: ${knownInvestments}`,
    "- ถ้าข้อความระบุชื่อหรือรหัสที่ใกล้เคียงรายชื่อเดิม ให้ใช้ชื่อจากระบบให้ตรงที่สุด",
    "- ถ้าข้อความไม่ได้ระบุชื่อกองทุนเลย และระบบมีกองทุนอยู่แล้วพอดี 1 กอง ให้ใช้ชื่อกองนั้น",
    "- ถ้าข้อความไม่ได้ระบุชื่อกองทุน และระบบมีมากกว่า 1 กองหรือยังไม่มีเลย ให้ส่งค่าว่างเพื่อให้แอพถามผู้ใช้เลือกเอง",
    "",
    "กติกา wallet_id:",
    `- รายชื่อกระเป๋าที่มีอยู่ในระบบ: ${knownWallets}`,
    "- ถ้าข้อความระบุกระเป๋า/บัญชีชัดเจน ให้ใช้ id ของกระเป๋านั้น",
    "- ถ้าไม่แน่ใจ ให้ใช้กระเป๋าที่เป็น default ถ้ามี ไม่เช่นนั้นส่งค่าว่าง",
    "",
    `ข้อความจากผู้ใช้: ${input}`,
  ].join("\n");
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return unauthorizedResponse();

  const apiKey = getGeminiApiKey();
  if (!apiKey) return missingGeminiKeyResponse();

  const body = (await request.json()) as AnalyzeInvestmentBody;
  const input = body.text?.trim() ?? "";
  const investments = (body.investments ?? [])
    .map((item) => ({ id: item.id?.trim() ?? "", name: item.name?.trim() ?? "", code: item.code ?? null }))
    .filter((item) => item.id && item.name)
    .slice(0, 50);
  const wallets = (body.wallets ?? [])
    .map((wallet) => ({ id: wallet.id?.trim() ?? "", name: wallet.name?.trim() ?? "", tag: wallet.tag, is_default: !!wallet.is_default }))
    .filter((wallet) => wallet.id && wallet.name)
    .slice(0, 50);

  if (!input) return Response.json({ error: "กรุณาพิมพ์ข้อความก่อน" }, { status: 400 });
  if (input.length > 500) return Response.json({ error: "ข้อความยาวเกินไป" }, { status: 400 });

  const today =
    body.defaultDate && DATE_INPUT_PATTERN.test(body.defaultDate)
      ? body.defaultDate
      : new Intl.DateTimeFormat("en-CA", { timeZone: body.timezone || DEFAULT_TIMEZONE }).format(new Date());
  const prompt = buildPrompt(input, today, investments, wallets);

  let response;
  try {
    const ai = createGeminiClient(apiKey);
    response = await generateGeminiContent(ai, {
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: GEMINI_EXTRACTION_TEMPERATURE,
      },
    }, { minimizeThinking: true });
  } catch (error) {
    return Response.json({ error: describeGeminiError(error, "วิเคราะห์รายการลงทุน") }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(response.text || "{}") as { items?: unknown[] };
    return Response.json({ items: parsed.items ?? [] });
  } catch (error) {
    console.error("Gemini analyze-investment: could not parse response as JSON", error, response.text);
    return Response.json({ error: "AI ส่งข้อมูลกลับมาในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่" }, { status: 502 });
  }
}
