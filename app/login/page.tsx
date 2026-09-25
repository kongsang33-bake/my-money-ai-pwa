import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";
import { LoginScreen } from "@/components/login";

// The sign-in page (components/login.tsx). The boot splash (layout.tsx) is
// hidden here by CSS (body:has(.login-page)), since the app page that
// normally removes it never runs on this route.
export const metadata: Metadata = {
  title: `เข้าสู่ระบบ - ${APP_NAME}`,
};

export default function LoginPage() {
  return <LoginScreen />;
}
