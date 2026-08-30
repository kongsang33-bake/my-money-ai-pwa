// Client-side image compression for the two upload paths in the app:
// square profile avatars and rectangular receipt/slip photos. Both cap
// their stored size well under Supabase's row/column limits by re-encoding
// at decreasing quality until they fit.
import type { SlipImage } from "./types.ts";

export const profileImageMaxInputBytes = 10 * 1024 * 1024;
export const profileImageMaxStoredBytes = 1.5 * 1024 * 1024;
export const profileImageSize = 512;
export const slipImageMaxInputBytes = 15 * 1024 * 1024;
export const slipImageMaxStoredBytes = 3 * 1024 * 1024;
export const slipImageMaxDimension = 1800;

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function dataUrlBytes(value: string) {
  const payload = value.split(",")[1] ?? "";
  return Math.ceil((payload.length * 3) / 4);
}

export function loadImage(value: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("อ่านรูปไม่สำเร็จ"));
    image.src = value;
  });
}

export async function compressProfileImage(file: File) {
  if (file.size > profileImageMaxInputBytes) {
    throw new Error("รูปใหญ่เกินไป กรุณาเลือกรูปไม่เกิน 10MB");
  }

  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการย่อรูป");

  canvas.width = profileImageSize;
  canvas.height = profileImageSize;

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;

  context.clearRect(0, 0, profileImageSize, profileImageSize);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, profileImageSize, profileImageSize);

  const webpPreview = canvas.toDataURL("image/webp", 0.86);
  const mimeType = webpPreview.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
  const qualities = [0.9, 0.82, 0.74, 0.66, 0.58];

  for (const quality of qualities) {
    const compressed = canvas.toDataURL(mimeType, quality);
    if (dataUrlBytes(compressed) <= profileImageMaxStoredBytes) return compressed;
  }

  throw new Error("ย่อรูปแล้วยังใหญ่เกินไป ลองเลือกรูปอื่นที่ไม่ซับซ้อนมากครับ");
}

// Slips need their full rectangle (unlike a cropped-to-square avatar) and
// legible text, so this scales proportionally instead of cropping, capping
// the longest edge rather than forcing a fixed square.
export async function compressSlipImage(file: File): Promise<SlipImage> {
  if (file.size > slipImageMaxInputBytes) {
    throw new Error("รูปใหญ่เกินไป กรุณาเลือกรูปไม่เกิน 15MB");
  }

  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการย่อรูป");

  const scale = Math.min(1, slipImageMaxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const qualities = [0.85, 0.75, 0.65, 0.55, 0.45];
  for (const quality of qualities) {
    const compressed = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlBytes(compressed) <= slipImageMaxStoredBytes) {
      const [, data = ""] = compressed.split(",");
      return {
        id: `${Date.now()}-${file.name}`,
        name: file.name,
        mimeType: "image/jpeg",
        data,
        preview: compressed,
      };
    }
  }

  throw new Error("ย่อรูปแล้วยังใหญ่เกินไป ลองเลือกรูปอื่นที่ชัดเจนกว่านี้");
}
