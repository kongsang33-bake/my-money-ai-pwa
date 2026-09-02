import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin NEXT_PUBLIC_ENABLE_PREVIEW to a concrete value for every build.
  //
  // app/page.tsx gates the end-to-end fixture hook on this, and relies on the
  // branch folding to dead code when it is off. That only happens if the
  // compiler sees a literal: left genuinely undefined, Turbopack emits a
  // runtime `process.env.…` lookup instead and the guarded block ships. Giving
  // it an explicit "0" default here means the off case is compiled as
  // `"1" !== "0"` and the whole block disappears -- and, just as important,
  // that the safe value is the default rather than something a deploy has to
  // remember to set.
  //
  // `npm run verify:preview-stripped` asserts the result on the built bundle.
  env: {
    NEXT_PUBLIC_ENABLE_PREVIEW: process.env.NEXT_PUBLIC_ENABLE_PREVIEW === "1" ? "1" : "0",
  },
};

export default nextConfig;
