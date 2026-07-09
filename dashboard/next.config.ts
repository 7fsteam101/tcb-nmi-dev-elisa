import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer pulls in pdfkit/fontkit — keep them external so Next
  // does not try to bundle their binary/font assets into the server build.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
