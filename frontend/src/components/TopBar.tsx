"use client";

import {
  Languages,
  LogOut,
  Monitor,
  Moon,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from "lucide-react";
import clsx from "clsx";
import { IconButton, Menu } from "./Menu";
import { LANGS, useI18n, type Lang } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";

type Props = {
  onToggleAssistant: () => void;
  assistantOpen: boolean;
  onOpenConsole: () => void;
  consoleOpen: boolean;
};

const THEME_ICON: Record<Theme, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/**
 * 顶栏三块: 品牌 / 业务动作 / 设置。
 *
 * 右上角这一组是**设置和管理面**入口 —— 主题、语言、控制面、登出。业务动作 (AI 助手)
 * 留在中间, 因为它属于"用这个产品"而不是"配这个产品"。这条线就是业务面和管理面的分界,
 * 顶栏上先分清楚, 下面的页面才分得清楚。
 */
export function TopBar({
  onToggleAssistant,
  assistantOpen,
  onOpenConsole,
  consoleOpen,
}: Props) {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const ThemeIcon = THEME_ICON[theme];

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line bg-card px-4 sm:px-5">
      <span className="flex min-w-0 items-center gap-2.5">
        <ScanSearch className="size-6 shrink-0 text-primary" />
        <span className="truncate text-base font-semibold tracking-tight">{t("app.name")}</span>
        <span className="hidden font-mono text-[11px] uppercase tracking-wider text-muted lg:inline">
          vibe coding demo
        </span>
      </span>

      <div className="flex items-center gap-2">
        {/* 业务动作 —— 和右侧那组设置之间留一道分隔线, 让"用"和"配"在视觉上分开 */}
        <button
          onClick={onToggleAssistant}
          aria-pressed={assistantOpen}
          className={clsx(
            "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition",
            assistantOpen
              ? "border-primary bg-primary/10 text-primary"
              : "border-line text-muted hover:border-ink/25 hover:text-ink",
          )}
        >
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">{t("nav.assistant")}</span>
        </button>

        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

        <Menu
          icon={<ThemeIcon className="size-4" />}
          label={t("nav.theme")}
          value={theme}
          onChange={setTheme}
          options={(Object.keys(THEME_ICON) as Theme[]).map((id) => {
            const Icon = THEME_ICON[id];
            return {
              id,
              label: t(`theme.${id}` as "theme.system"),
              icon: <Icon className="size-4" />,
            };
          })}
        />
        <Menu
          icon={<Languages className="size-4" />}
          label={t("nav.lang")}
          value={lang}
          onChange={setLang}
          options={LANGS.map((l) => ({ id: l.id as Lang, label: l.label }))}
        />
        <IconButton
          icon={<SlidersHorizontal className="size-4" />}
          label={t("nav.console")}
          onClick={onOpenConsole}
          active={consoleOpen}
        />
        <IconButton
          icon={<LogOut className="size-4" />}
          label={t("nav.logout")}
          onClick={async () => {
            await fetch("/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        />
      </div>
    </header>
  );
}
