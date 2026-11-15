/** @type {import("next").NextConfig} */
const nextConfig = {
  // orangekit-smart-account ships untranspiled TypeScript
  transpilePackages: [
    "@mezo-org/passport",
    "@mezo-org/orangekit",
    "@mezo-org/orangekit-smart-account",
    "@mezo-org/orangekit-contracts",
  ],
};
export default nextConfig;
