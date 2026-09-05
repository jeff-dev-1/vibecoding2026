"use client";

import { useEffect, useState } from "react";
import { useTheme } from "./theme";

/**
 * 把设计 token 读成真正的颜色字符串。
 *
 * 图表库 (recharts) 要的是 `fill="#84cc16"` 这样的值, 吃不了 Tailwind 类名, 也吃不了
 * `rgb(var(--c-line))` —— 它会把这串东西原样塞进 SVG 属性。所以这里在运行时把变量
 * 解析成实际颜色。
 *
 * 依赖 theme: 切换深浅色会改 <html> 上的属性, 变量随之变化, 但 getComputedStyle 的
 * 结果不会自己通知 React。以 theme 为依赖重算一次, 图表的网格线和坐标轴才会跟着变。
 *
 * 系统主题下用户在操作系统里改深浅色也要跟上, 所以额外监听 prefers-color-scheme。
 */
export type TokenColors = {
  line: string;
  muted: string;
  ink: string;
  card: string;
  green: string;
  red: string;
  blue: string;
  orange: string;
  primary: string;
};

// SSR 与首帧的兜底值 (浅色)。真值在 effect 里读到后覆盖。
const FALLBACK: TokenColors = {
  line: "rgb(224 221 213)",
  muted: "rgb(90 110 120)",
  ink: "rgb(19 66 82)",
  card: "rgb(255 255 255)",
  green: "rgb(0 204 102)",
  red: "rgb(200 71 39)",
  blue: "rgb(0 192 232)",
  orange: "rgb(250 88 45)",
  primary: "rgb(0 204 102)",
};

const NAMES: Record<keyof TokenColors, string> = {
  line: "--c-line",
  muted: "--c-muted",
  ink: "--c-ink",
  card: "--c-card",
  green: "--c-green",
  red: "--c-red",
  blue: "--c-blue",
  orange: "--c-orange",
  primary: "--c-primary",
};

function read(): TokenColors {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as TokenColors;
  for (const [k, varName] of Object.entries(NAMES) as [keyof TokenColors, string][]) {
    const raw = cs.getPropertyValue(varName).trim();
    // 变量存的是 "R G B" 三元组; 拿不到 (老浏览器/首帧) 就退回兜底值。
    out[k] = raw ? `rgb(${raw})` : FALLBACK[k];
  }
  return out;
}

export function useTokenColors(): TokenColors {
  const { theme } = useTheme();
  const [colors, setColors] = useState<TokenColors>(FALLBACK);

  useEffect(() => {
    setColors(read());
    if (theme !== "system") return;
    // 跟随系统时, 系统自己改深浅色也要重算 —— 这不经过 React 的任何 state。
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setColors(read());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return colors;
}
