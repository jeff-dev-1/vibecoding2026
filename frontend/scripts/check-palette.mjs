/**
 * 图表色板的回归闸门。
 *
 * 色板出问题不会报错, 只会让一部分读者看到几种"差不多的颜色" —— 而这只有在
 * 红绿色盲、打印、或某一种主题下才显形, 正常视力开着彩屏是看不出来的。
 * 所以不靠眼睛, 直接把 globals.css 里的 token 值喂给校验器算。
 *
 * 校验器随仓携带 (scripts/vendor/), 因为它来自一个不在仓库里的技能目录 ——
 * 只在我这台机器上能跑的闸门等于没有闸门。
 *
 * 跑: node scripts/check-palette.mjs
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../src/app/globals.css"), "utf8");
const validator = resolve(here, "vendor/validate_palette.js");

/** 取某个块里的 --c-chart-N。深色块有两份 (媒体查询 + [data-theme])。 */
function chartTokens(block) {
  const out = [];
  for (let i = 1; i <= 5; i++) {
    const m = block.match(new RegExp(`--c-chart-${i}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
    if (!m) return null;
    const hex = [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("");
    out.push(`#${hex}`);
  }
  return out;
}

// 浅色 = :root 那一段 (到第一个 @media 之前); 深色 = [data-theme="dark"] 那一段
const light = chartTokens(css.slice(0, css.indexOf("@media")));
const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'));
const dark = chartTokens(darkBlock);

let failed = false;
for (const [mode, palette] of [["light", light], ["dark", dark]]) {
  if (!palette) {
    console.error(`✗ ${mode}: globals.css 里找不到完整的 --c-chart-1..5`);
    failed = true;
    continue;
  }
  console.log(`\n── ${mode}: ${palette.join(", ")}`);
  let out;
  try {
    out = execFileSync("node", [validator, palette.join(","), "--mode", mode], {
      encoding: "utf8",
    });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
  }
  const lines = out.split("\n").filter((l) => /\[(PASS|FAIL|WARN)\]|→/.test(l));
  console.log(lines.join("\n"));
  if (/FAILED/.test(out) || /\[FAIL\]/.test(out)) failed = true;
}

if (failed) {
  console.error("\n✗ 图表色板未通过校验 —— 见上面标 FAIL 的项");
  process.exit(1);
}
console.log("\n✓ 图表色板浅色/深色均通过全部检查");
