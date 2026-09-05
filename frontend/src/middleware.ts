import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verify } from "@/lib/session";

// 访问码门 —— 没有有效会话 cookie 一律重定向到 /login。
//
// 现在验的是签名和过期时间, 不再是"cookie 存在就放行"。原来的 `demo_auth=1`
// 在 devtools 里敲一行就能伪造, 那道门形同虚设; 见 lib/session.ts。

const PUBLIC_PREFIXES = ["/login", "/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const ok = await verify(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret());
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
