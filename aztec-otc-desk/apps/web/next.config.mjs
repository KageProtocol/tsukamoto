/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    // Increase timeout for API routes (order creation takes ~30s)
    serverComponentsExternalPackages: [],
  },
  // API routes timeout configuration
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'x-vercel-max-duration',
            value: '300', // 5 minutes
          },
        ],
      },
    ];
  },
};

export default nextConfig;

