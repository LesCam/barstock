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
};

module.exports = nextConfig;
