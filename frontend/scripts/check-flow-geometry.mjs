/**
 * 供应链流水线图的几何自检。
 *
 * 图里的节点是绝对定位的 (x 是中心, width 是盒宽), 分组框也是手写坐标。
 * 两者对不上时页面不会报错 —— 只会画出两个叠在一起的节点, 或者一个顶出框外的节点,
 * 而这只有人眼看截图才发现得了。上一次就是 redteam 右边缘 903 撞上 staging 左边缘 902,
 * 差 1px, 加上两条边框看上去就是粘在一起。
 *
 * 所以直接从源码里把坐标读出来算一遍。跑: node scripts/check-flow-geometry.mjs
 */
import { readFileSync } from "node:fs";

const SRC = new URL("../src/components/SupplyChainFlow.tsx", import.meta.url);
const src = readFileSync(SRC, "utf8");

const MIN_GAP = 12;     // 相邻节点之间至少留的间隙 (px, 画布坐标)
const MIN_MARGIN = 8;   // 节点到所属分组框边的最小内边距

const num = (name, text) => {
  const m = text.match(new RegExp(`\\b${name}:\\s*(-?\\d+)`));
  return m ? Number(m[1]) : null;
};

// 节点: 逐个对象字面量抓 id/x/y/width
const nodes = [];
for (const m of src.matchAll(/\{[^{}]*\bid:\s*"([\w-]+)"[^{}]*\}/gs)) {
  const [block, id] = m;
  const x = num("x", block), y = num("y", block), width = num("width", block);
  if (x === null || y === null || width === null) continue;
  nodes.push({ id, x, y, width, l: x - width / 2, r: x + width / 2 });
}

// 分组框: 有 w/h 的对象
const groups = [];
for (const m of src.matchAll(/\{[^{}]*\bid:\s*"([\w-]+)"[^{}]*\bw:\s*(\d+)[^{}]*\}/gs)) {
  const [block, id] = m;
  const x = num("x", block), y = num("y", block);
  const w = num("w", block), h = num("h", block);
  if ([x, y, w, h].some((v) => v === null)) continue;
  groups.push({ id, x, y, w, h, l: x, r: x + w, t: y, b: y + h });
}

const fail = [];

// 1. 同一行内相邻节点不能重叠
const rows = new Map();
for (const n of nodes) (rows.get(n.y) ?? rows.set(n.y, []).get(n.y)).push(n);
for (const [y, row] of rows) {
  row.sort((a, b) => a.l - b.l);
  for (let i = 1; i < row.length; i++) {
    const gap = row[i].l - row[i - 1].r;
    if (gap < MIN_GAP) {
      fail.push(`row y=${y}: ${row[i - 1].id} 右缘 ${row[i - 1].r} → ${row[i].id} 左缘 ${row[i].l} = ${gap}px (需 ≥${MIN_GAP})`);
    }
  }
}

// 2. 节点必须落在某个分组框内, 且留够内边距
for (const n of nodes) {
  const owner = groups.find((g) => n.y > g.t && n.y < g.b && n.l >= g.l - 40 && n.r <= g.r + 40);
  if (!owner) { fail.push(`${n.id}: 找不到所属分组框`); continue; }
  if (n.l - owner.l < MIN_MARGIN) fail.push(`${n.id} 左缘 ${n.l} 距 ${owner.id} 框 ${n.l - owner.l}px (需 ≥${MIN_MARGIN})`);
  if (owner.r - n.r < MIN_MARGIN) fail.push(`${n.id} 右缘 ${n.r} 距 ${owner.id} 框 ${owner.r - n.r}px (需 ≥${MIN_MARGIN})`);
}

console.log(`节点 ${nodes.length} 个, 分组 ${groups.length} 个`);
if (fail.length) {
  console.error("✗ 几何检查未通过:\n  " + fail.join("\n  "));
  process.exit(1);
}
console.log("✓ 间距与边距全部通过");
