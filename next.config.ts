import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The demo recording drives this app through Playwright; keep output stable.
  reactStrictMode: false,

  /**
   * Dynamic's server-wallet SDK ships prebuilt MPC binaries (.node) for several
   * platforms. Bundling it makes webpack try to parse those, so it is left to
   * Node's own resolver at runtime — which is also what Dynamic requires, since
   * the SDK does not run on edge runtimes.
   */
  serverExternalPackages: ['@dynamic-labs-wallet/node-evm', '@dynamic-labs-wallet/node'],
};

export default nextConfig;
