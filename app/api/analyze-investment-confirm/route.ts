import { createGeminiClient, getGeminiApiKey, GEMINI_MODEL, missingGeminiKeyResponse } from "@/lib/gemini";
import { requireUser, unauthorizedResponse } from "@/lib/auth";

// Reads one purchase row's unit count off a mutual-fund transaction
// statement photo — nothing else. The app already knows which pending
// purchase this is for (the user picked it before attaching the photo) and
// already has its amount, so this endpoint never has to guess *which*
// pending purchase a statement belongs to — only "what does this one row
// say" — which sidesteps the date-mismatch/ambiguous-matching problem
// entirely (settlement date on the statement is routinely a day or more
// after the money actually left the wallet).
const schema = {
  type: "object",
  properties: {
    found: { type: "boolean", description: "true ถ้าพบแถวรายการ \"ซื้อ\"/Purchase ในรูปที่แนบ" },
    units: { type: "number", description: "จำนวนหน่วยที่ได้จากรายการซื้อที่ตรงกับยอดเงินที่ระบุมากที่สุด (คอลัมน์ หน่วยเพิ่มขึ้น/ตดลง หรือ Unit) ถ้าไม่พบให้ใส่ 0" },
    price_per_unit: { type: "number", description: "ราคาต่อหน่วยของรายการซื้อนั้น (คอลัมน์ ราคาต่อหน่วย หรือ Price/Unit) ถ้าไม่พบให้ใส่ 0" },
    amount: { type: "number", description: "จำนวนเงินของรายการซื้อที่อ่านได้จริงจากรูป ถ้าไม่พบให้ใส่ 0" },
    transaction_date: { type: "string", description: "วันที่ทำรายการซื้อนั้นรูปแบบ YYYY-MM-DD ถ้าไม่พบให้ส่งค่าว่าง" },
  },
  required: ["found", "units", "price_per_unit", "amount", "transaction_date"],
  additionalProperties: false,
};

type AnalyzeInvestmentConfirmBody = {
  image?: { data: string; mimeType: string };
  targetAmount?: number;
};

const maxImageBytes = 5 * 1024 * 1024;

function imageBytes(base64: string) {
  return Math.floor((base64.length * 3) / 4);
}

function buildPrompt(targetAmount?: number) {
  return [
    "รูปที่แนบมาคือ statement ประวัติการซื้อขายหน่วยลงทุนจากธนาคาร/บลจ. อ่านเฉพาะแถวที่เป็นรายการ \"ซื้อ\"/Purchase เท่านั้น ห้ามนับแถวยอดยกมา (Beginning Balance) หรือยอดคงเหลือ (Ending Balance) เป็นรายการซื้อ",
    targetAmount
      ? `ผู้ใช้กำลังยืนยันรายการซื้อที่จ่ายเงินไป ${targetAmount} บาท ถ้ามีรายการซื้อหลายแถวในรูป ให้เลือกแถวที่ยอดเงินตรงหรือใกล้เคียง ${targetAmount} บาทที่สุด วันที่ในรูปอาจไม่ตรงกับวันที่โอนเงินจริง (บลจ. มักบันทึกช้ากว่า 1-2 วันทำการ) ดังนั้นให้ยึดยอดเงินเป็นหลักในการเลือกแถว ไม่ใช่วันที่`
      : "ถ้ามีรายการซื้อหลายแถว ให้เลือกแถวล่าสุด",
    "ถ้าไม่พบแถวรายการซื้อเลยในรูป ให้ found = false และใส่ 0/ค่าว่างในช่องอื่น ห้ามเดา",
  ].join("\n");
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return unauthorizedResponse();

  const apiKey = getGeminiApiKey();
  if (!apiKey) return missingGeminiKeyResponse();

  const body = (await request.json()) as AnalyzeInvestmentConfirmBody;
  const image = body.image;
  if (!image?.data || !image.mimeType) return Response.json({ error: "กรุณาแนบรูป statement ก่อน" }, { status: 400 });
  if (!image.mimeType.startsWith("image/")) return Response.json({ error: "รองรับเฉพาะไฟล์รูปภาพเท่านั้น" }, { status: 400 });
  if (imageBytes(image.data) > maxImageBytes) return Response.json({ error: "รูปภาพต้องมีขนาดไม่เกิน 5MB" }, { status: 400 });

  const targetAmount = typeof body.targetAmount === "number" && Number.isFinite(body.targetAmount) ? body.targetAmount : undefined;
  const prompt = buildPrompt(targetAmount);

  let response;
  try {
    const ai = createGeminiClient(apiKey);
    response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        { text: prompt },
        { inlineData: { data: image.data, mimeType: image.mimeType } },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.1,
      },
    });
  } catch (error) {
    console.error("Gemini analyze-investment-confirm failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `AI อ่าน statement ไม่สำเร็จ: ${detail}` }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(response.text || "{}") as { found?: boolean; units?: number; price_per_unit?: number; amount?: number; transaction_date?: string };
    return Response.json({
      found: !!parsed.found,
      units: typeof parsed.units === "number" ? parsed.units : 0,
      price_per_unit: typeof parsed.price_per_unit === "number" ? parsed.price_per_unit : 0,
      amount: typeof parsed.amount === "number" ? parsed.amount : 0,
      transaction_date: parsed.transaction_date || "",
    });
  } catch (error) {
    console.error("Gemini analyze-investment-confirm: could not parse response as JSON", error, response.text);
    return Response.json({ error: "AI ส่งข้อมูลกลับมาในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่" }, { status: 502 });
  }
}
