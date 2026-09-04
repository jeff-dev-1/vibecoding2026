import "./globals.css";
import type { Metadata } from "next";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider, THEME_BOOT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "AI Log Analysis · Vibe Coding Demo",
  description: "Logs → AI structured summary → cited evidence, gated by Envoy AI Gateway.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang 由 I18nProvider 在客户端按选择改写; 这里给一个服务端能确定的默认值。
    //
    // suppressHydrationWarning: 下面那段首帧脚本会在 hydration 之前往 <html> 上写
    // data-theme, 服务端渲染时没有这个属性 —— 差异是设计如此 (不这么做就会闪一帧浅色)。
    // 只作用于这一个元素本身的属性, 不会顺延到子树。next-themes 用的也是这个办法。
    <html lang="zh-Hans" suppressHydrationWarning>
      <head>
        {/* 在首帧之前把 data-theme 写上, 否则选了深色的人会先看到一帧浅色。
            内容是本文件里的常量字符串, 不含任何用户输入。 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="bg-bg text-ink antialiased">
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
