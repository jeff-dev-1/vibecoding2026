"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

/**
 * 一个按钮 + 一个下拉。
 *
 * 每个设置项并排三个按钮在只有一个设置时还行, 有两个之后就不行了:
 * 顶栏高度是固定的, 手机只有 390px。
 */
export function Menu<T extends string>({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: T;
  options: { id: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  // 外部点击和 Escape 都要能关。少一个, 就会出现"演示时挂在内容上方关不掉的菜单"。
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation(); // 别让 Escape 顺手把外面的控制面浮层也关了
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  return (
    <span ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        aria-label={label}
        className={clsx(
          "grid size-9 place-items-center rounded-xl border transition",
          open
            ? "border-primary text-primary"
            : "border-line text-muted hover:border-ink/25 hover:text-ink",
        )}
      >
        {icon}
      </button>
      {open && (
        <span
          role="menu"
          className="absolute right-0 z-50 mt-1.5 grid min-w-40 gap-0.5 rounded-xl border border-line bg-card p-1.5 shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === o.id}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className="flex items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-surface"
            >
              {o.icon}
              <span className="flex-1">{o.label}</span>
              {value === o.id && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** 顶栏上和 Menu 长得一样、但只是个动作的按钮 (控制面 / 登出)。 */
export function IconButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        "grid size-9 place-items-center rounded-xl border transition",
        active
          ? "border-primary text-primary"
          : "border-line text-muted hover:border-ink/25 hover:text-ink",
      )}
    >
      {icon}
    </button>
  );
}
