/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: [
      '@aztec/aztec.js',
      '@aztec/accounts',
      '@aztec/circuits.js',
      '@aztec/foundation',
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Copy WASM files to output
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Handle WASM files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    return config;
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

