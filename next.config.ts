const isDev = process.env.NODE_ENV !== "production";

const nextConfig = {
  async headers() {
    if (!isDev) return [];
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data:",
              // 👇 add BOTH 9099 variants so Auth emulator is allowed
              "connect-src 'self' http://localhost:5001 http://127.0.0.1:5001 http://localhost:9099 http://127.0.0.1:9099 ws://localhost:*",
              "object-src 'none'",
              "base-uri 'self'"
            ].join("; ")
          }
        ]
      }
    ];
  }
};

export default nextConfig;