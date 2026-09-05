"use client";

import React from "react";

// 轻量 markdown 渲染 — 覆盖 LLM 常用输出: 标题 / 粗体 / 行内代码 / 有序无序列表 / 表格 / 段落。
// 不引第三方依赖, 避免远程 build 风险。
//
// 样式几乎全在 globals.css 的 `.answer` 里: 这里只负责产出正确的元素,
// 颜色和间距交给设计 token, 深浅色两套主题就都对了。
//
// 表格是后加的 —— LLM 回答"状态码分布"这类问题时几乎必然输出表格, 之前没有解析,
// 于是整张表以纯文本 + 一堆竖线的形态糊在答案里。

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // 处理 **bold** 和 `code`
  const out: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-ink">
          {m[2]}
        </strong>,
      );
    } else if (m[3] !== undefined) {
      out.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em] text-brand-red"
        >
          {m[3]}
        </code>,
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** `| a | b |` → ["a", "b"]。两端的空单元格是分隔竖线留下的, 不是数据。 */
function splitRow(line: string): string[] {
  const cells = line.trim().split("|");
  if (cells[0].trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

/** `|---|:--:|` 这种分隔行 —— 它是"上一行是表头"的唯一信号。 */
function isDivider(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");
}

export function Markdown({ text }: { text: string }) {
  const lines = (text || "").split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuf: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!listBuf) return;
    const items = listBuf.items;
    if (listBuf.ordered) {
      blocks.push(
        <ol key={`ol-${key++}`} className="my-1.5 ml-1 space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted">
              <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                {i + 1}
              </span>
              <span>{renderInline(it, `oli-${key}-${i}`)}</span>
            </li>
          ))}
        </ol>,
      );
    } else {
      blocks.push(
        <ul key={`ul-${key++}`} className="my-1.5 space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted">
              <span className="mt-[0.45rem] h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
              <span>{renderInline(it, `uli-${key}-${i}`)}</span>
            </li>
          ))}
        </ul>,
      );
    }
    listBuf = null;
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }

    // 表格 — 需要"表头行 + 分隔行"两行才算数, 否则一句带竖线的散文会被误判成表。
    if (line.includes("|") && li + 1 < lines.length && isDivider(lines[li + 1])) {
      flushList();
      const head = splitRow(line);
      const rows: string[][] = [];
      let j = li + 2;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim()) {
        rows.push(splitRow(lines[j]));
        j++;
      }
      blocks.push(
        <table key={`t-${key++}`}>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i}>{renderInline(h, `th-${key}-${i}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {/* 按表头列数对齐: 模型偶尔会少写一格, 少的补空而不是让整行错位。 */}
                {head.map((_, ci) => (
                  <td key={ci}>{renderInline(r[ci] ?? "", `td-${key}-${ri}-${ci}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      li = j - 1;
      continue;
    }

    // 标题
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      const level = h[1].length;
      const cls =
        level <= 2
          ? "mt-3 mb-1 text-sm font-bold text-ink"
          : "mt-2 mb-1 text-[13px] font-semibold text-ink";
      blocks.push(
        <div key={`h-${key++}`} className={cls}>
          {renderInline(h[2], `h-${key}`)}
        </div>,
      );
      continue;
    }
    // 有序列表
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      if (!listBuf || !listBuf.ordered) {
        flushList();
        listBuf = { ordered: true, items: [] };
      }
      listBuf.items.push(ol[1]);
      continue;
    }
    // 无序列表
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (!listBuf || listBuf.ordered) {
        flushList();
        listBuf = { ordered: false, items: [] };
      }
      listBuf.items.push(ul[1]);
      continue;
    }
    // 普通段落
    flushList();
    blocks.push(
      <p key={`p-${key++}`} className="my-1 text-sm leading-relaxed text-muted">
        {renderInline(line, `p-${key}`)}
      </p>,
    );
  }
  flushList();

  return <div className="answer">{blocks}</div>;
}
