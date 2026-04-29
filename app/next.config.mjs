/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["film-goblin-worker", "film-goblin-notifier"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.mzstatic.com" },
    ],
  },
  webpack(config) {
    // The worker package uses ESM `.js` specifiers that point to `.ts` sources
    // (NodeNext-style imports). Teach webpack to resolve them to `.ts`.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".js"],
    };
    return config;
  },
};

export default nextConfig;
