export default {
  async headers() {
    return [{ source: "/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }];
  },
};

const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
};