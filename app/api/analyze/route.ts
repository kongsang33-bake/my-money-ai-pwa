import { createGeminiClient, getGeminiApiKey, GEMINI_MODEL, missingGeminiKeyResponse } from "@/lib/gemini";
import { CATEGORIES, TRANSACTION_TYPES } from "@/lib/taxonomy";
import { requireUser, unauthorizedResponse } from "@/lib/auth";

const itemSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "ชื่อรายการสั้น กระชับ เป็นภาษาไทย" },
    category: { type: "string", enum: CATEGORIES },
    amount: { type: "number", minimum: 0, description: "ยอดเงินที่จ่ายหรือรับจริง รวมเศษสตางค์ทศนิยมได้ถึง 2 ตำแหน่ง ห้ามปัดเศษ" },
    transaction_type: {
      type: "string",
      enum: TRANSACTION_TYPES,
      description: "ชนิดธุรกรรมตาม logic กระเป๋าหลักและยอดลูกหนี้",
    },
    debtor_name: {
      type: "string",
      description: "ชื่อบุคคลที่เป็นลูกหนี้ เช่น แฟน เพื่อนเอ คุณบี ถ้าไม่พบให้ใช้ ไม่ระบุ",
    },
    date: { type: "string", description: "วันที่รูปแบบ YYYY-MM-DD" },
    note: { type: "string", description: "คำอธิบายสั้น ๆ ถ้ามีบริบทสำคัญ" },
    wallet_id: { type: "string", description: "id ของกระเป๋าที่เหมาะที่สุด ถ้าระบุไม่ได้ให้ส่งค่าว่าง" },
    transfer_to_wallet_id: { type: "string", description: "id กระเป๋าปลายทาง ใช้เฉพาะ transaction_type เป็น transfer ถ้าไม่ใช่ให้ส่งค่าว่าง" },
  },
  required: ["title", "category", "amount", "transaction_type", "debtor_name", "date", "note", "wallet_id", "transfer_to_wallet_id"],
  additionalProperties: false,
};

const schema = {
  type: "object",
  properties: {
    items: { type: "array", items: itemSchema },
    receiptTotal: {
      type: "number",
      description: "ยอดรวมสุทธิที่ระบุไว้บนสลิปโดยตรง (ตัวเลขที่พิมพ์อยู่บนสลิปจริง ๆ) ถ้ามีรูปสลิปแนบมาและเห็นยอดรวมชัดเจน ให้ใส่ตัวเลขนั้น ถ้าไม่มีรูปสลิปแนบมา หรือมีรูปแต่ไม่เห็นยอดรวมชัดเจน ให้ใส่ 0",
    },
  },
  required: ["items", "receiptTotal"],
  additionalProperties: false,
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

type AnalyzeWallet = {
  id: string;
  name: string;
  tag: "cash" | "savings" | "investment" | "other";
  is_default?: boolean;
};

type AnalyzeBody = {
  text?: string;
  timezone?: string;
  defaultDate?: string;
  images?: AnalyzeImage[];
  debtors?: AnalyzeDebtor[];
  wallets?: AnalyzeWallet[];
};

const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/;

const maxImageBytes = 5 * 1024 * 1024;

function imageBytes(base64: string) {
  return Math.floor((base64.length * 3) / 4);
}

function buildPrompt(input: string, today: string, hasImages: boolean, debtors: AnalyzeDebtor[], wallets: AnalyzeWallet[]) {
  const lendNames = debtors.filter((debtor) => debtor.kind === "lend").map((debtor) => debtor.name);
  const ownNames = debtors.filter((debtor) => debtor.kind === "own").map((debtor) => debtor.name);
  const knownDebtors = lendNames.length ? lendNames.join(", ") : "ยังไม่มีรายชื่อลูกหนี้ที่บันทึกไว้";
  const knownOwnDebts = ownNames.length ? ownNames.join(", ") : "ยังไม่มีรายการหนี้ของฉันที่บันทึกไว้";
  const knownWallets = wallets.length
    ? wallets.map((wallet) => `${wallet.id} = ${wallet.name} (${wallet.tag}${wallet.is_default ? ", default" : ""})`).join(", ")
    : "ยังไม่มีกระเป๋าที่บันทึกไว้";
  return [
    `วันที่กำลังบันทึกรายการนี้คือ ${today}`,
    "แยกรายรับรายจ่ายจากข้อความและ/หรือรูปสลิปเป็น JSON เท่านั้น ห้ามสร้างรายการที่ไม่มีหลักฐานในข้อความหรือรูป",
    "ถ้าข้อความหรือรูปไม่ได้ระบุวันที่ไว้ชัดเจน ให้ใช้วันที่กำลังบันทึกด้านบน ถ้ารูปสลิปมีวันที่ ให้ใช้วันที่บนสลิปแทน",
    hasImages
      ? "ถ้ามีรูปสลิป ให้อ่านชื่อร้าน/ผู้รับเงิน รายการสินค้า ยอดเงิน วันที่ เวลา และข้อความอ้างอิงจากรูป"
      : "ไม่มีรูปแนบ ให้วิเคราะห์จากข้อความเท่านั้น",
    "",
    `หมวดหมู่ที่อนุญาต: ${CATEGORIES.join(", ")}`,
    "",
    ...(hasImages
      ? [
          "กติกาสลิปที่มีหลายสินค้า:",
          "- ถ้าสลิปมีรายการสินค้าแยกบรรทัดพร้อมราคาต่อชิ้น ให้สร้างหนึ่งรายการต่อสินค้าหนึ่งบรรทัดเสมอ ห้ามรวมสินค้าหลายชิ้นเป็นรายการเดียว แม้จะอยู่หมวดหมู่เดียวกันก็ตาม",
          "- ตั้ง title ของแต่ละรายการตามชื่อสินค้านั้นจริง ๆ ตามที่พิมพ์บนสลิป ไม่ใช่ชื่อร้านหรือชื่อรวม",
          "- จัดหมวดหมู่ (category) ของแต่ละรายการแยกกันตามประเภทของสินค้านั้นเอง เช่น เครื่องดื่ม/ของกินให้เป็นอาหาร เครื่องเขียนหรือของใช้ทั่วไปให้เป็นของใช้",
          "- ยอดรวมของทุกรายการที่แยกจากสลิปเดียวกัน ต้องบวกกันได้เท่ากับยอดสุทธิที่ระบุบนสลิป",
          "- ใส่ยอดสุทธิที่อ่านได้จากสลิปลงใน receiptTotal ตรง ๆ ตามที่พิมพ์ไว้ (ไม่ใช่ผลรวมที่คำนวณเอง) เพื่อให้แอพเทียบยอดได้ภายหลัง",
          "",
        ]
      : []),
    "กติกา transaction_type:",
    "- income = เงินเข้าจากภายนอกเท่านั้น เช่น เงินเดือน โบนัส รายรับ ขายของได้ ตู้กดน้ำขายได้ — เงินที่ย้ายจากกระเป๋าตัวเองไปอีกกระเป๋าไม่ใช่ income",
    "- transfer = โยกเงินระหว่างกระเป๋าของตัวเองเอง เช่น เก็บออม เก็บเงิน โอนเข้าเงินออม แบ่งไปลงทุน ไม่ใช่รายรับใหม่และไม่ใช่รายจ่าย",
    "- personal_expense = จ่ายเองส่วนตัว 100%",
    "- lend = ออกเงินให้บุคคลอื่นก่อน/ให้ยืม/จ่ายแทน 100%",
    "- split_half = หารกับบุคคลอื่น/หารครึ่ง/คนละครึ่ง ให้ amount เป็นยอดเต็มที่ผู้ใช้จ่ายจริง",
    "- debt_repayment = บุคคลอื่นคืนเงิน/โอนคืน/เคลียร์ยอด",
    "- debt_payment = ผ่อนชำระหนี้สินของผู้ใช้เองที่ครบกำหนดแล้ว (ไม่ใช่ให้คนอื่นยืม) เช่น ผ่อนบ้าน ผ่อนรถ จ่ายบิลบัตรเครดิตที่ครบกำหนด",
    "- card_charge = ซื้อของ/จ่ายเงินก้อนใหม่โดยตัดผ่านบัตรเครดิต ยังไม่ได้จ่ายเงินสดจริง เป็นยอดที่จะไปรวมในบิลบัตรรอจ่ายทีหลัง เช่น รูดบัตร ตัดบัตร ผ่านบัตรเครดิต จ่ายผ่านบัตร — ต่างจาก debt_payment ตรงที่ card_charge คือการก่อหนี้ใหม่จากการซื้อของ ไม่ใช่การจ่ายบิลที่ครบกำหนดแล้ว",
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
    "กติกา wallet_id:",
    `- รายชื่อกระเป๋าที่มีอยู่ในระบบ: ${knownWallets}`,
    "- ถ้าข้อความระบุว่าจ่ายด้วยบัตร/เครดิต/บัตรเครดิต ให้เลือกกระเป๋าที่ชื่อหรือประเภทใกล้เคียงที่สุด",
    "- ถ้าระบุบัญชี/ธนาคาร/กระเป๋าชัดเจน ให้ใช้ id ของกระเป๋านั้น",
    "- ถ้าไม่แน่ใจ ให้ใช้กระเป๋าที่เป็น default ถ้ามี ไม่เช่นนั้นส่งค่าว่าง",
    "- ถ้าเป็น transfer ให้ wallet_id = กระเป๋าต้นทาง และ transfer_to_wallet_id = กระเป๋าปลายทาง ถ้าไม่ระบุต้นทางให้ใช้กระเป๋า default ถ้าระบุไม่ได้ทั้งคู่ให้ส่งค่าว่าง",
    "",
    "กติกาเงินจากเครื่องซักผ้า/ตู้น้ำหยอดเหรียญ:",
    "- ถ้าข้อความพูดถึงการเปิดเครื่องซักผ้า/ตู้น้ำหยอดเหรียญ/ตู้เหรียญเพื่อเอาเงินหรือเหรียญออกมา (ไม่ว่าจะเป็นรอบนับประจำเดือนหรือเปิดฉุกเฉินกลางเดือน) ให้สร้างรายการ income เต็มจำนวนที่ระบุ โดยเลือก wallet_id เป็นกระเป๋าที่ชื่อใกล้เคียงคำว่า \"เหรียญสำรอง\" มากที่สุดในรายชื่อกระเป๋าเสมอ (ไม่ใช่กระเป๋า default) ถ้าไม่มีกระเป๋าชื่อนี้ในระบบเลยให้ใช้กระเป๋า default แทน",
    "- ถ้าในข้อความเดียวกันมีการพูดถึงการให้ลูกค้าแลกเหรียญ/แลกเงินต่อจากนั้น ให้สร้างรายการที่สองเพิ่มเติม เป็น transaction_type = transfer โดย wallet_id = กระเป๋า \"เหรียญสำรอง\" นั้น และ transfer_to_wallet_id = กระเป๋า default เท่ากับยอดที่แลกให้ลูกค้า (ห้ามใส่เป็น personal_expense หรือ gift เพราะไม่ใช่รายจ่ายจริง)",
    "",
    "กติกา debtor_name สำหรับ debt_payment และ card_charge:",
    "- ใช้ debtor_name เป็นชื่อก้อนหนี้ของฉันเอง (เช่น บ้าน, รถ) หรือชื่อบัตรเครดิตถ้าเป็น card_charge ไม่ใช่ชื่อร้าน/ชื่อสินค้าที่ซื้อ",
    `- รายชื่อหนี้ของฉันที่มีอยู่ในระบบ: ${knownOwnDebts}`,
    "- ถ้าใกล้เคียงชื่อที่มีอยู่ ให้ใช้ชื่อเดิม ถ้าไม่พบให้ตั้งชื่อใหม่สั้น ๆ เพื่อให้แอพสร้างรายการหนี้ให้อัตโนมัติ",
    "- สำหรับ card_charge ถ้าข้อความไม่ได้ระบุชื่อบัตรชัดเจน ให้ใช้ชื่อบัตรที่มีอยู่แล้วถ้ามีแค่ใบเดียวในระบบ ถ้ามีหลายใบหรือยังไม่มีเลย ให้ใช้ \"บัตรเครดิต\" เป็นชื่อชั่วคราว",
    "",
    `ข้อความจากผู้ใช้: ${input || "(ไม่มีข้อความ ผู้ใช้แนบรูปอย่างเดียว)"}`,
  ].join("\n");
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return unauthorizedResponse();

  const apiKey = getGeminiApiKey();
  if (!apiKey) return missingGeminiKeyResponse();

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
  const wallets = (body.wallets ?? [])
    .map((wallet) => ({ id: wallet.id?.trim() ?? "", name: wallet.name?.trim() ?? "", tag: wallet.tag, is_default: !!wallet.is_default }))
    .filter((wallet) => wallet.id && wallet.name)
    .slice(0, 50);

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
  const prompt = buildPrompt(input, today, images.length > 0, debtors, wallets);

  let response;
  try {
    const ai = createGeminiClient(apiKey);
    response = await ai.models.generateContent({
      model: GEMINI_MODEL,
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
    const parsed = JSON.parse(response.text || "{}") as { items?: unknown[]; receiptTotal?: number };
    return Response.json({ items: parsed.items ?? [], receiptTotal: parsed.receiptTotal ?? 0 });
  } catch (error) {
    console.error("Gemini analyze: could not parse response as JSON", error, response.text);
    return Response.json({ error: "AI ส่งข้อมูลกลับมาในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่" }, { status: 502 });
  }
}
