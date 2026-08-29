import { createGeminiClient, describeGeminiError, generateGeminiContent, getGeminiApiKey, missingGeminiKeyResponse } from "@/lib/gemini";
import { CATEGORIES, TRANSACTION_TYPES, type WalletTag } from "@/lib/taxonomy";
import { requireUser, unauthorizedResponse } from "@/lib/auth";
import { DATE_INPUT_PATTERN, DEFAULT_TIMEZONE, GEMINI_EXTRACTION_TEMPERATURE, MAX_IMAGE_BYTES, MAX_SLIP_IMAGES, imageBytes } from "@/lib/constants";

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
    ambiguous: {
      type: "boolean",
      description: "true ถ้าข้อความมีชื่อคนเกี่ยวกับการให้/รับเงิน แต่ไม่ได้ระบุชัดว่าให้เปล่าหรือต้องคืน (ไม่แน่ใจระหว่าง income/gift กับ lend/borrow) ถ้าชัดเจนอยู่แล้วหรือไม่มีชื่อคนเกี่ยวข้องเลย ให้ใส่ false",
    },
  },
  required: ["title", "category", "amount", "transaction_type", "debtor_name", "date", "note", "wallet_id", "transfer_to_wallet_id", "ambiguous"],
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
  tag: WalletTag;
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
    "- income = เงินเข้าจากภายนอกเท่านั้น เช่น เงินเดือน โบนัส รายรับ ขายของได้ ตู้กดน้ำขายได้ — เงินที่ย้ายจากกระเป๋าตัวเองไปอีกกระเป๋าไม่ใช่ income — รวมถึงเงินที่คนอื่นให้เราแบบให้เปล่าไม่ต้องคืนด้วย แม้ข้อความจะมีชื่อคน เช่น พี่แอนให้เงิน 200 บาท คือ income ไม่ใช่ lend เพราะเราไม่ได้เป็นหนี้เขา",
    "- transfer = โยกเงินระหว่างกระเป๋าของตัวเองเอง เช่น เก็บออม เก็บเงิน โอนเข้าเงินออม แบ่งไปลงทุน ไม่ใช่รายรับใหม่และไม่ใช่รายจ่าย",
    "- personal_expense = จ่ายเองส่วนตัว 100%",
    "- lend = ออกเงินให้บุคคลอื่นก่อน/ให้ยืม/จ่ายแทน 100%",
    "- borrow = ยืมเงินสดจากบุคคลอื่นมาใช้ ต้องคืนภายหลัง เช่น ยืมเงินเพื่อน ขอยืมเงินพี่ ไม่ใช่หนี้ที่มีอยู่แล้วแบบ debt_payment และไม่ใช่รูดบัตรแบบ card_charge",
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
    "- ถ้าไม่แน่ใจว่าให้เปล่าหรือให้ยืม/ยืมมา (ambiguous = true) ให้ใส่ชื่อคนนั้นลงใน debtor_name ไว้ก่อนเสมอ แม้ transaction_type ที่เดาไว้จะเป็น income หรือ gift ก็ตาม เผื่อผู้ใช้แก้เป็น lend/borrow ภายหลัง",
    "- ถ้าชัดเจนว่าให้เปล่าจริง (ambiguous = false และ transaction_type = income หรือ gift) ให้ใช้ ไม่ระบุ ไม่ต้องสร้างลูกหนี้ใหม่จากชื่อนั้น",
    "",
    "กติกา ambiguous:",
    "- ตั้งเป็น true เมื่อข้อความมีชื่อคนเกี่ยวข้องกับการให้/รับเงิน แต่ไม่ได้ระบุชัดว่าต้องคืนเงินหรือไม่ เช่น \"พี่แอนให้เงิน 200 บาท\" หรือ \"ให้เงินเพื่อน 200 บาท\" (ทั้งสองแบบไม่รู้ว่าให้เปล่าหรือให้ยืม)",
    "- ถ้าข้อความมีคำชัดเจนอยู่แล้ว เช่น ให้เปล่า, ไม่ต้องคืน, ยืม, ขอยืม, คืนเงิน ให้ใช้ false",
    "- ถ้าไม่มีชื่อคนเกี่ยวข้องเลย (รายรับ/รายจ่ายส่วนตัวทั่วไป) ให้ใช้ false เสมอ",
    "",
    "กติกา wallet_id:",
    `- รายชื่อกระเป๋าที่มีอยู่ในระบบ: ${knownWallets}`,
    "- ถ้าข้อความระบุว่าจ่ายด้วยบัตร/เครดิต/บัตรเครดิต ให้เลือกกระเป๋าที่ชื่อหรือประเภทใกล้เคียงที่สุด",
    "- ถ้าระบุบัญชี/ธนาคาร/กระเป๋าชัดเจน ให้ใช้ id ของกระเป๋านั้น",
    "- ถ้าไม่แน่ใจ ให้ใช้กระเป๋าที่เป็น default ถ้ามี ไม่เช่นนั้นส่งค่าว่าง",
    "- ถ้าเป็น transfer ให้ wallet_id = กระเป๋าต้นทาง และ transfer_to_wallet_id = กระเป๋าปลายทาง ถ้าไม่ระบุต้นทางให้ใช้กระเป๋า default ถ้าระบุไม่ได้ทั้งคู่ให้ส่งค่าว่าง",
    "",
    "กติกาเงินสดย่อย (tag = petty) สำหรับรายได้จากธุรกิจส่วนตัว เช่น ตู้หยอดเหรียญ เครื่องซักผ้า แผงขายของ:",
    "- ถ้าข้อความพูดถึงการเก็บ/เปิดเครื่อง/ตู้ธุรกิจส่วนตัวเพื่อเอาเงินสดออกมา (ไม่ว่าจะเป็นรอบนับประจำเดือนหรือเปิดฉุกเฉินกลางรอบ) ให้สร้างรายการ income เต็มจำนวนที่ระบุ โดยเลือก wallet_id เป็นกระเป๋าที่มี tag = petty ในรายชื่อกระเป๋าเสมอ (ไม่ใช่กระเป๋า default) ถ้าไม่มีกระเป๋า tag = petty ในระบบเลยให้ใช้กระเป๋า default แทน",
    "- ถ้าในข้อความเดียวกันมีการพูดถึงการให้ลูกค้าแลกเหรียญ/แลกเงิน/ทอนเงินต่อจากนั้น ให้สร้างรายการที่สองเพิ่มเติม เป็น transaction_type = transfer โดย wallet_id = กระเป๋า tag = petty นั้น และ transfer_to_wallet_id = กระเป๋า default เท่ากับยอดที่แลกให้ลูกค้า (ห้ามใส่เป็น personal_expense หรือ gift เพราะไม่ใช่รายจ่ายจริง)",
    "",
    "กติกา debtor_name สำหรับ debt_payment และ card_charge:",
    "- ใช้ debtor_name เป็นชื่อก้อนหนี้ของฉันเอง (เช่น บ้าน, รถ) หรือชื่อบัตรเครดิตถ้าเป็น card_charge ไม่ใช่ชื่อร้าน/ชื่อสินค้าที่ซื้อ",
    `- รายชื่อหนี้ของฉันที่มีอยู่ในระบบ: ${knownOwnDebts}`,
    "- ถ้าใกล้เคียงชื่อที่มีอยู่ ให้ใช้ชื่อเดิม ถ้าไม่พบให้ตั้งชื่อใหม่สั้น ๆ เพื่อให้แอพสร้างรายการหนี้ให้อัตโนมัติ",
    "- สำหรับ card_charge ถ้าข้อความไม่ได้ระบุชื่อบัตรชัดเจน ให้ใช้ชื่อบัตรที่มีอยู่แล้วถ้ามีแค่ใบเดียวในระบบ ถ้ามีหลายใบหรือยังไม่มีเลย ให้ใช้ \"บัตรเครดิต\" เป็นชื่อชั่วคราว",
    "",
    "กติกา debtor_name สำหรับ borrow:",
    "- ต่างจาก debt_payment/card_charge ตรงที่ borrow ใช้ debtor_name เป็นชื่อบุคคลจริงที่ให้เรายืมเงิน (เช่น พี่แอน, เพื่อนบี) ไม่ใช่ชื่อก้อนหนี้/ชื่อบัตร",
    "- ถ้าใกล้เคียงชื่อที่มีอยู่ในรายชื่อหนี้ของฉันด้านบน ให้ใช้ชื่อเดิม ถ้าไม่พบให้ใช้ชื่อคนนั้นตรง ๆ เพื่อให้แอพสร้างรายการหนี้ใหม่อัตโนมัติ",
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
  if (images.length > MAX_SLIP_IMAGES) return Response.json({ error: `แนบรูปได้สูงสุด ${MAX_SLIP_IMAGES} รูปต่อครั้ง` }, { status: 400 });

  for (const image of images) {
    if (!image.mimeType.startsWith("image/")) return Response.json({ error: "รองรับเฉพาะไฟล์รูปภาพเท่านั้น" }, { status: 400 });
    if (imageBytes(image.data) > MAX_IMAGE_BYTES) return Response.json({ error: "รูปภาพต้องมีขนาดไม่เกิน 5MB ต่อรูป" }, { status: 400 });
  }

  const today =
    body.defaultDate && DATE_INPUT_PATTERN.test(body.defaultDate)
      ? body.defaultDate
      : new Intl.DateTimeFormat("en-CA", { timeZone: body.timezone || DEFAULT_TIMEZONE }).format(new Date());
  const prompt = buildPrompt(input, today, images.length > 0, debtors, wallets);

  let response;
  try {
    const ai = createGeminiClient(apiKey);
    response = await generateGeminiContent(ai, {
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
        temperature: GEMINI_EXTRACTION_TEMPERATURE,
      },
      // A receipt photo pushes the model through OCR + per-line itemization
      // + debtor/split matching, which genuinely takes longer than a plain
      // text entry -- give it more room before the per-attempt timeout
      // aborts and forces a retry/fallback cycle mid-flight.
    }, { timeoutMs: images.length > 0 ? 25000 : 7000 });
  } catch (error) {
    return Response.json({ error: describeGeminiError(error, "วิเคราะห์รายการ") }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(response.text || "{}") as { items?: unknown[]; receiptTotal?: number };
    return Response.json({ items: parsed.items ?? [], receiptTotal: parsed.receiptTotal ?? 0 });
  } catch (error) {
    console.error("Gemini analyze: could not parse response as JSON", error, response.text);
    return Response.json({ error: "AI ส่งข้อมูลกลับมาในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่" }, { status: 502 });
  }
}
