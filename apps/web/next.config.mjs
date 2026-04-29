const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.PUBLIC_URL || "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
};

export default nextConfig;
