import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "เงินของฉัน - บันทึกรายรับรายจ่ายด้วย AI",
  description: "แอปบันทึกรายรับรายจ่ายที่ช่วยแยกรายการและจัดหมวดหมู่ด้วย AI",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#145c45",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
