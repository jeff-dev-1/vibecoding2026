import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 简单密码门 — 未带 demo_auth cookie 一律重定向到 /login。
// cookie 由 /auth/login 校验密码后设置 (httpOnly)。

const PUBLIC_PREFIXES = ["/login", "/auth/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const auth = req.cookies.get("demo_auth");
  if (!auth?.value) {
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
