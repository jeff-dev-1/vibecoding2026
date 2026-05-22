import { NextResponse } from "next/server";

// 校验用户名+密码 -> 设 httpOnly cookie。凭证存 env (DEMO_USERNAME/DEMO_PASSWORD), 不进代码仓。
export async function POST(req: Request) {
  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = body?.username ?? "";
    password = body?.password ?? "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const expectedUser = process.env.DEMO_USERNAME || "admin";
  const expectedPass = process.env.DEMO_PASSWORD || "vibecoding2026";
  if (username !== expectedUser || password !== expectedPass) {
    return NextResponse.json({ ok: false, error: "用户名或密码错误" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("demo_auth", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 小时
  });
  return res;
}
