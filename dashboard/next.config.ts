import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Note attachments upload through a server action as multipart FormData;
    // the framework default caps action bodies at 1MB. Sized for several
    // 5MB-capped files per note plus multipart overhead.
    serverActions: { bodySizeLimit: "26mb" },
  },
};

export default nextConfig;
