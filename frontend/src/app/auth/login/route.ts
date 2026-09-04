import { NextResponse } from "next/server";
import { SESSION_COOKIE, accessCode, mint, sessionSecret } from "@/lib/session";

// 校验访问码 → 签发一枚签名 cookie (见 lib/session.ts)。
// 访问码存 env (DEMO_ACCESS_CODE), 不进代码仓。
export async function POST(req: Request) {
  let code = "";
  try {
    const body = await req.json();
    // code 是现在的字段名; password 是旧名, 一起认, 免得老的脚本/书签直接坏掉。
    code = body?.code ?? body?.password ?? "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  if (typeof code !== "string" || code !== accessCode()) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await mint(sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 走 HTTPS 时才加 secure。演示常在 http://<内网 IP>:3020 上跑, 无条件加 secure
    // 会让 cookie 根本不被存下来 —— 表现为"输对了码却一直跳回登录页"。
    secure: new URL(req.url).protocol === "https:",
    maxAge: Number(process.env.SESSION_TTL_HOURS ?? 12) * 3600,
  });
  return res;
}
