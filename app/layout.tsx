import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { ServiceWorkerRegistrar } from "./service-worker-registrar";
import { APP_NAME } from "@/lib/constants";
import "./globals.css";

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: `${APP_NAME} - บันทึกรายรับรายจ่ายด้วย AI`,
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

// Kept in sync with --bg in app/globals.css (:root) by hand -- metadata
// here can't read CSS custom properties. Cinema is dark only, so there is
// just the one color now.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page run under the iPhone's home indicator so
  // env(safe-area-inset-bottom) reports it -- without this it reads 0 and
  // the bottom nav sat flush on the screen's edge (see --nav-lift).
  viewportFit: "cover",
  themeColor: "#0a0b0c",
};

const splashInitScript = `(function(){window.__splashStartedAt=Date.now();var el=document.getElementById("app-splash");if(el)el.classList.add("app-splash-play");})();`;

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
              <p id="app-splash-text">{APP_NAME}</p>
            </div>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: splashInitScript }} />
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
