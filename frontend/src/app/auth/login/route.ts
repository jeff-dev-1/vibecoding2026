import { NextResponse } from "next/server";

// 校验密码 -> 设 httpOnly cookie。密码存后端 env (DEMO_PASSWORD), 不进代码仓。
export async function POST(req: Request) {
  let password = "";
  try {
    const body = await req.json();
    password = body?.password ?? "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const expected = process.env.DEMO_PASSWORD || "vibecoding2026";
  if (password !== expected) {
    return NextResponse.json({ ok: false, error: "密码错误" }, { status: 401 });
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
