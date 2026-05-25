/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["film-goblin-worker", "film-goblin-notifier"],
  images: {
    // Vercel image optimization can return 402s when the project hits account
    // limits. Apple/TMDB already serve sized poster assets, so load them direct.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "*.mzstatic.com" },
      { protocol: "https", hostname: "image.tmdb.org" },
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
