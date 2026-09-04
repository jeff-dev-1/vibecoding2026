/**
 * 登录会话 cookie —— 签名 + 带过期。
 *
 * 它替换掉的东西值得说清楚: 原来的 cookie 就是 `demo_auth=1`。任何人在浏览器
 * devtools 里敲一行 `document.cookie = "demo_auth=1"` 就进来了, 那道密码门等于没有。
 *
 * 现在 cookie 存的是 `<过期时间>.<HMAC(过期时间)>`:
 *   - 存的是过期时间的签名, 不是访问码本身 —— 拿到 cookie 的人也拿不到访问码
 *   - 过期时间在明文里, 但改了它签名就对不上
 *   - 密钥只在服务端 (SESSION_SECRET), 前端拿不到, 所以伪造不出来
 *
 * 用 Web Crypto 而不是 node:crypto: middleware 跑在 Edge runtime 上, 那里没有
 * node:crypto。Web Crypto 在 middleware 和 route handler 两边都有, 一份代码两处用。
 */

export const SESSION_COOKIE = "alad_session";

/** 会话有效期。演示场景一天足够, 讲完课 cookie 自己失效。 */
const TTL_MS = Number(process.env.SESSION_TTL_HOURS ?? 12) * 3600_000;

const enc = new TextEncoder();

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}

/**
 * 定长比较。
 *
 * 逐字符 `===` 会在第一个不同的字符处返回, 于是"猜对了几位"能从耗时上量出来。
 * 这里把两串异或到底再判断, 让比较本身不泄漏签名。
 */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 签发一枚新 cookie 值。 */
export async function mint(secret: string): Promise<string> {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${await sign(exp, secret)}`;
}

/** 校验 cookie: 签名对得上, 且还没过期。 */
export async function verify(value: string | undefined, secret: string): Promise<boolean> {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig) return false;
  if (!Number(exp) || Number(exp) < Date.now()) return false;
  return same(sig, await sign(exp, secret));
}

/**
 * 会话密钥。
 *
 * 没配 SESSION_SECRET 时回落到访问码派生 —— 保证开箱即用 (演示仓库不该因为少一个
 * 环境变量就打不开), 同时把"没配密钥"这件事标出来: 派生密钥的强度取决于访问码,
 * 真要放到公网, .env 里给一个 `openssl rand -base64 32`。
 */
export function sessionSecret(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit) return explicit;
  return `derived:${accessCode()}`;
}

/** 访问码。DEMO_ACCESS_CODE 优先; DEMO_PASSWORD 是旧名, 留着不破坏已有部署的 .env。 */
export function accessCode(): string {
  return process.env.DEMO_ACCESS_CODE || process.env.DEMO_PASSWORD || "vibecoding2026";
}
