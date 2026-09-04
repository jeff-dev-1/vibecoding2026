"use client";

import { Languages, Loader2, Monitor, Moon, ScanSearch, Sun } from "lucide-react";
import { useState } from "react";
import { Menu } from "@/components/Menu";
import { LANGS, useI18n, type Lang } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";

const THEME_ICON: Record<Theme, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

/**
 * 登录 —— 左边一张照片, 右边一个访问码输入框。
 *
 * 只要一个访问码, 不要用户名: 这是一个共享的演示环境, 没有"你是谁"这回事,
 * 多一个永远填 admin 的输入框只是多一步。参考项目也是这么做的。
 */
export default function LoginPage() {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const ThemeIcon = THEME_ICON[theme];

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (r.ok) {
        window.location.href = "/";
      } else {
        setErr(t("login.failed"));
      }
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    // 表单固定一栏宽, 剩下全给照片 —— 比例分栏在宽屏上会把表单也拉宽,
    // 一个 340px 的输入框摊在 700px 的栏里, 两边各空一大片。
    <div className="grid min-h-screen lg:grid-cols-[1fr_440px]">
      {/* 左：照片。窄屏下收起 —— 竖屏上一条竖条既看不清也挤掉表单。 */}
      <ArtPanel />

      {/* 右：表单 */}
      <div className="relative flex flex-col">
        <div className="flex justify-end gap-2 p-4">
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
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-24">
          <form onSubmit={submit} className="w-full max-w-[340px]">
            {/* 产品名本身就是标题 —— 之前"品牌小字 + Sign in 大字"把重点放反了,
                页面上最大的字是"登录"这个动作, 而不是这是什么产品。 */}
            <h1 className="flex items-center gap-2.5 text-[27px] font-semibold tracking-tight">
              <ScanSearch className="size-7 shrink-0 text-primary" />
              {t("app.name")}
            </h1>

            <label htmlFor="code" className="mb-1.5 mt-9 block text-xs text-muted">
              {t("login.accessCode")}
            </label>
            <input
              id="code"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[15px] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
            />

            {err && (
              <p className="mt-3.5 rounded-lg bg-brand-red/10 px-3 py-2.5 text-sm text-brand-red">
                {err}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !code}
              className="mt-[1.125rem] flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? t("login.submitting") : t("login.submit")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * 左侧照片。整张就是照片, 不压任何文字 —— 压上去要配暗角, 暗角又要跟深浅色主题打架,
 * 而这些字本来也没人读。产品要说的话在右边那一栏。
 *
 * 用 <img> 而不是 CSS background-image: 前者能带 fetchPriority / decoding 提示,
 * 首屏这张大图值得优先取。object-position 偏上, 让地平线落在面板中部,
 * 而不是被裁成一整块没有焦点的天空。
 */
function ArtPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-surface lg:block">
      {/* eslint-disable-next-line @next/next/no-img-element -- 静态资产, 不需要 next/image 的按需裁剪 */}
      <img
        src="/login-bg.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "50% 45%" }}
        fetchPriority="high"
        decoding="async"
      />
    </div>
  );
}
