import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { THEME_STORAGE_KEY } from "@/lib/constants";
import "./globals.css";

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Monii - บันทึกรายรับรายจ่ายด้วย AI",
  description: "แอปบันทึกรายรับรายจ่ายที่ช่วยแยกรายการและจัดหมวดหมู่ด้วย AI",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/icons/favicon-32.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

// Kept in sync with --bg in app/globals.css (:root and :root[data-theme="dark"])
// by hand -- metadata here can't read CSS custom properties.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff3e1" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
};

const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}window.__splashStartedAt=Date.now();var el=document.getElementById("app-splash");if(el)el.classList.add("app-splash-play");})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={ibmPlexSansThai.variable}>
      <body>
        <div id="app-splash">
          <div id="app-splash-inner">
            <div id="app-splash-logo-stack">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img id="app-splash-logo" src="/icons/icon-512.png" alt="" width={112} height={112} decoding="sync" fetchPriority="high" />
            </div>
            <div id="app-splash-text-wrap">
              <p id="app-splash-text">Monii</p>
            </div>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
