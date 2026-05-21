"use client";

import React from "react";

// 轻量 markdown 渲染 — 覆盖 LLM 常用输出: 标题 / 粗体 / 行内代码 / 有序无序列表 / 段落。
// 不引第三方依赖, 避免远程 build 风险。

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
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-slate-800">
          {m[2]}
        </strong>,
      );
    } else if (m[3] !== undefined) {
      out.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-rose-600"
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
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-600">
              <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600">
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
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-600">
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-indigo-400" />
              <span>{renderInline(it, `uli-${key}-${i}`)}</span>
            </li>
          ))}
        </ul>,
      );
    }
    listBuf = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    // 标题
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      const level = h[1].length;
      const cls =
        level <= 2
          ? "mt-3 mb-1 text-sm font-bold text-slate-800"
          : "mt-2 mb-1 text-[13px] font-semibold text-slate-700";
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
      <p key={`p-${key++}`} className="my-1 text-sm leading-relaxed text-slate-600">
        {renderInline(line, `p-${key}`)}
      </p>,
    );
  }
  flushList();

  return <div className="markdown">{blocks}</div>;
}
