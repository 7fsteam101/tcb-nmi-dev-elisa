
const nextConfig: NextConfig = {
  // @react-pdf/renderer pulls in pdfkit/fontkit — keep them external so Next
  // does not try to bundle their binary/font assets into the server build.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    // Note attachments upload through a server action as multipart FormData;
    // the framework default caps action bodies at 1MB. Sized for several
    // 5MB-capped files per note plus multipart overhead.
    serverActions: { bodySizeLimit: "26mb" },
  },
};

export default nextConfig;
