"use client";

import {
  Boxes,
  GitBranch,
  Hammer,
  PackageCheck,
  Rocket,
  ScanLine,
  ServerCog,
} from "lucide-react";
import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  ConfigChip,
  FlowPlayer,
  type FlowEdge,
  type FlowGroup,
  type FlowNode,
  type Frame,
} from "./FlowPlayer";
import { useI18n } from "@/lib/i18n";

/**
 * 交付流水线回放 —— 和运行时那张图是同一件事的另一个切面。
 *
 *   运行时回放  一个请求走过哪些跳, 护栏拦的是坏请求
 *   交付回放    一次交付走过哪些闸, Koi 拦的是坏软件
 *
 * 为什么 Koi 画在 install 之前:
 *
 * `docker build` 里跑的是 pip install / npm install, 而那正是恶意包执行的时刻 ——
 * pip 跑 setup.py, npm 跑 postinstall, 都是任意代码, 跑在持有 registry 推送凭证
 * 和部署 SSH 凭证的构建机上。门禁放在流水线末尾, 扫出来时:
 * 恶意代码已在构建机执行过、镜像已推进仓库、服务已经部署上线 —— 这时候 fail build
 * 只是记账, 攻击已经完成。
 *
 * 所以这张图画的是**应该**的姿势: 门禁在 install 之前。项目当前的 Jenkinsfile 把
 * Supply Chain Gate 放在部署之后 (理由是不想让门禁挂掉部署), 那一版作为"后置审计"
 * 保留在图的末端并明确标注 —— 演示要讲的正是这两者的区别, 而不是假装它已经改好了。
 */

const W = 1040;
const H = 410;

type Mode = "pass" | "block";

// 三段水平流, 而不是绕一圈:
//   上排  CI (checkout → 门禁)
//   下排  构建 (install → build → push)
//   右上  运行时 (deploy → 审计)
// 之前 build 在左下、push 在右上, 那条连线横穿整张图, 还从 install 身上压过去。
const GROUPS = (t: (k: any) => string): FlowGroup[] => [
  { id: "ci", x: 40, y: 30, w: 700, h: 148, label: t("sc.groupCi"), tone: "supply" },
  { id: "artifact", x: 40, y: 240, w: 758, h: 148, label: t("sc.groupArtifact"), tone: "app" },
  { id: "runtime", x: 800, y: 30, w: 236, h: 148, label: t("sc.groupRuntime"), tone: "gateway" },
];

function nodes(mode: Mode): FlowNode[] {
  return [
    {
      id: "checkout", x: 165, y: 108, label: "Checkout", icon: GitBranch, badge: "CI",
      tags: ["git"], tone: "supply", width: 190,
    },
    // 门禁在 install 之前 —— 这张图想说的就是这一点。
    {
      id: "koi", x: 480, y: 108, label: "Koi Gate", icon: ScanLine,
      badge: mode === "block" ? "BLOCK" : "PASS",
      tags: ["pip", "npm", "mcp"],
      tone: mode === "block" ? "danger" : "supply", width: 214,
    },
    {
      id: "install", x: 168, y: 320, label: "pip / npm install", icon: Boxes, badge: "INSTALL",
      tags: ["setup.py", "postinstall"], tone: "app", width: 230,
    },
    {
      id: "build", x: 432, y: 320, label: "docker build", icon: Hammer, badge: "BUILD",
      tone: "app", width: 190,
    },
    {
      id: "push", x: 668, y: 320, label: "registry push", icon: PackageCheck, badge: "PUSH",
      tone: "app", width: 190,
    },
    {
      id: "deploy", x: 918, y: 78, label: "deploy", icon: Rocket, badge: "DEPLOY",
      tone: "gateway", width: 196,
    },
    {
      id: "audit", x: 918, y: 146, label: "post-deploy audit", icon: ServerCog, badge: "REPORT",
      tone: "gateway", width: 214,
    },
  ];
}

const EDGES: FlowEdge[] = [
  { id: "checkout-koi", from: "checkout", to: "koi" },
  { id: "koi-install", from: "koi", to: "install" },
  { id: "install-build", from: "install", to: "build" },
  { id: "build-push", from: "build", to: "push" },
  { id: "push-deploy", from: "push", to: "deploy" },
  // 后置审计是旁路: 它不阻断, 只记录实际落地的是什么。
  { id: "deploy-audit", from: "deploy", to: "audit", dashed: true },
];

function buildFrames(mode: Mode, t: (k: any) => string): Frame[] {
  const frames: Frame[] = [
    {
      key: "checkout", title: t("sc.f.checkout"), ok: true,
      nodes: ["checkout"], edges: [],
      rows: [
        ["stage", "Checkout"],
        ["scans", "requirements.txt · package.json · ai-tools.yaml"],
      ],
    },
    {
      key: "gate", title: t("sc.f.gate"), ok: mode === "pass",
      nodes: ["checkout", "koi"], edges: ["checkout-koi"],
      rows:
        mode === "block"
          ? [
              ["verdict", "BLOCK"],
              ["artifact", "pypi · requests-toolbelt-x"],
              ["reason", t("sc.reasonBlock")],
              ["action", t("sc.actionBlock")],
            ]
          : [
              ["verdict", "PASS 21 · APPROVED 2"],
              ["policy", "approvals.yaml"],
              ["action", t("sc.actionPass")],
            ],
    },
  ];

  if (mode === "block") {
    // 拦下就到此为止 —— 后面几步确实没有发生, 不画。这正是前置门禁的价值。
    frames.push({
      key: "stop", title: t("sc.f.stopped"), ok: false,
      nodes: ["koi"], edges: [],
      rows: [
        ["prevented", t("sc.prevented1")],
        ["prevented ", t("sc.prevented2")],
        ["prevented  ", t("sc.prevented3")],
      ],
    });
    return frames;
  }

  frames.push(
    {
      key: "install", title: t("sc.f.install"), ok: true,
      nodes: ["koi", "install"], edges: ["koi-install"],
      rows: [
        ["runs", "setup.py · postinstall"],
        ["note", t("sc.installNote")],
      ],
    },
    {
      key: "build", title: t("sc.f.build"), ok: true,
      nodes: ["install", "build"], edges: ["install-build"],
      rows: [["stage", "Docker Build"], ["images", "backend · frontend"]],
    },
    {
      key: "push", title: t("sc.f.push"), ok: true,
      nodes: ["build", "push"], edges: ["build-push"],
      rows: [["stage", "Docker Push"], ["registry", "harbor · :BUILD_NUMBER"]],
    },
    {
      key: "deploy", title: t("sc.f.deploy"), ok: true,
      nodes: ["push", "deploy"], edges: ["push-deploy"],
      rows: [["stage", "Deploy to VM"], ["then", "Health · Smoke · Red Team · Pentest"]],
    },
    {
      key: "audit", title: t("sc.f.audit"), ok: true,
      nodes: ["deploy", "audit"], edges: ["deploy-audit"],
      rows: [
        ["stage", "Supply Chain Gate"],
        ["scope", t("sc.auditScope")],
        ["blocking", t("sc.auditNonBlocking")],
      ],
    },
  );
  return frames;
}

export function SupplyChainFlow() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("pass");
  const frames = useMemo(
    () => buildFrames(mode, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode],
  );

  return (
    <FlowPlayer
      width={W}
      height={H}
      groups={GROUPS(t)}
      nodes={nodes(mode)}
      edges={EDGES}
      frames={frames}
      resetKey={mode}
      minWidth={760}
      header={
        <div className="flex flex-wrap items-center gap-3">
          {/* 两个剧本: 全部放行 / 命中一个高危包。切换即重播。 */}
          <nav className="flex gap-1 rounded-xl bg-surface p-1">
            {(["pass", "block"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={clsx(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                  mode === m
                    ? m === "block"
                      ? "bg-card text-brand-red shadow-sm"
                      : "bg-card text-primary shadow-sm"
                    : "text-muted hover:text-ink",
                )}
              >
                {t(m === "pass" ? "sc.modePass" : "sc.modeBlock")}
              </button>
            ))}
          </nav>
          <span className="text-xs text-muted">{t("sc.shiftLeftHint")}</span>
          <span className="flex-1" />
          <ConfigChip label="GATE" value="pre-install" />
        </div>
      }
    />
  );
}
