"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * 三态主题: system / light / dark。
 *
 * `system` 不落 data-theme, 交给 globals.css 里的 prefers-color-scheme 媒体查询;
 * light / dark 落属性, 在两个方向上都赢过媒体查询。配色本身全在 CSS 变量里,
 * 这里只负责把属性写到 <html> 上。
 */
export type Theme = "system" | "light" | "dark";

export const THEMES: Theme[] = ["system", "light", "dark"];

const STORAGE_KEY = "alad-theme";

/**
 * 首帧脚本 —— 必须在 <head> 里同步执行, 否则读者选了深色也会先闪一帧浅色。
 * 内联进 layout 的 dangerouslySetInnerHTML, 这是它唯一正当的用法之一。
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "system",
  setTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved && THEMES.includes(saved)) setTheme(saved);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
