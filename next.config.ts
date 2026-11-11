import type { NextConfig } from "next";
import { PUBLIC_MARKETING_PATHS } from "./lib/publicMetadata";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers(){
    const credentialHeaders = ["/login/manager/forgot-password","/login/manager/reset-password","/api/auth/forgot-password","/api/auth/reset-password"].map(source=>({source,headers:[
      {key:"Cache-Control",value:"no-store, max-age=0"},{key:"Referrer-Policy",value:"no-referrer"},{key:"X-Robots-Tag",value:"noindex, nofollow"},
    ]}));
    const publicNames = PUBLIC_MARKETING_PATHS.filter(path => path !== "/").map(path => path.slice(1));
    const privateHeaders = ["/api/:path*", "/manager/:path*", "/admin/:path*", "/setup/:path*", "/login/:path*", "/payment/:path*"].map(source => ({ source, headers: [
      { key: "Cache-Control", value: "private, no-store, max-age=0" }, { key: "Referrer-Policy", value: "no-referrer" },
    ] }));
    return [...credentialHeaders, ...privateHeaders, {
      source: "/:accountCode/review",
      headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }, { key: "Referrer-Policy", value: "no-referrer" }],
    }, {
      // Root is public; every other path defaults to noindex unless explicitly
      // listed above. Includes property-code checkout routes and API responses.
      source: `/:path((?!${publicNames.map(name => `${name}$`).join("|")}).+)`,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }];
  },
};

export default nextConfig;
