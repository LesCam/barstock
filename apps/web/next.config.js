/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@barstock/api",
    "@barstock/database",
    "@barstock/types",
    "@barstock/validators",
    "@barstock/ui",
  ],
  serverExternalPackages: ["argon2", "@node-rs/argon2", "@prisma/client", "prisma"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

module.exports = nextConfig;
