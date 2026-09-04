"use client";

import {
  Boxes,
  GitBranch,
  Hammer,
  PackageCheck,
  Radar,
  Rocket,
  ScanLine,
  ShieldCheck,
  Swords,
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

const W = 1420;
const H = 470;

type Mode = "pass" | "block";

/**
 * 两道闸, 卡在不同的地方 —— 这是整张图要说的事。
 *
 *   Koi 门禁      卡 install。恶意包是在 pip/npm install 时执行的, 门禁必须在它之前。
 *   红队 + 渗透   卡 promote。两者都需要一个跑着的目标 (一个打模型行为, 一个打 HTTP 面),
 *                所以不可能在 build 之前; 但"需要跑着"不等于"必须在生产上跑" ——
 *                在预发上跑, 卡的是"能不能上生产", 而不是"能不能部署"。
 *
 * 这样安排的一个实际好处: 没有哪道闸会让你连预发都部署不上去, 演示照跑, 生产照卡。
 *
 * 这张图画的是推荐架构, 不是某一份 Jenkinsfile 的现状。
 */
const GROUPS = (t: (k: any) => string): FlowGroup[] => [
  { id: "ci", x: 36, y: 28, w: 470, h: 178, label: t("sc.groupCi"), tone: "supply" },
  { id: "artifact", x: 546, y: 28, w: 838, h: 178, label: t("sc.groupArtifact"), tone: "app" },
  { id: "staging", x: 36, y: 250, w: 900, h: 178, label: t("sc.groupStaging"), tone: "gateway" },
  { id: "prod", x: 976, y: 250, w: 408, h: 178, label: t("sc.groupProd"), tone: "vendor" },
];

function nodes(mode: Mode): FlowNode[] {
  return [
    {
      id: "checkout", x: 148, y: 122, label: "Checkout", icon: GitBranch, badge: "CI",
      tags: ["git"], tone: "supply", width: 180,
    },
    // 第一道闸: 卡 install。命中就到此为止, 后面几步都不会发生。
    {
      id: "koi", x: 388, y: 122, label: "Koi Gate", icon: ScanLine,
      badge: mode === "block" ? "BLOCK" : "PASS",
      tags: ["pip", "npm", "mcp"],
      tone: mode === "block" ? "danger" : "supply", width: 196,
    },
    // 门禁落在 CI 框和构建框的边界上 —— "在 install 之前"由框线本身说出来。
    {
      id: "install", x: 672, y: 122, label: "pip / npm install", icon: Boxes, badge: "INSTALL",
      tags: ["setup.py", "postinstall"], tone: "app", width: 214,
    },
    {
      id: "build", x: 922, y: 122, label: "docker build", icon: Hammer, badge: "BUILD",
      tone: "app", width: 176,
    },
    {
      id: "push", x: 1160, y: 122, label: "registry push", icon: PackageCheck, badge: "PUSH",
      tone: "app", width: 182,
    },
    // 预发: 先有个跑着的东西, 才谈得上打它。
    {
      id: "staging", x: 152, y: 344, label: "deploy → staging", icon: Rocket, badge: "STAGING",
      tone: "gateway", width: 202,
    },
    {
      id: "redteam", x: 404, y: 344, label: "red team", icon: Swords, badge: "GATE",
      tags: ["injection", "jailbreak"], tone: "gateway", width: 188,
    },
    {
      id: "pentest", x: 646, y: 344, label: "pentest (DAST)", icon: Radar, badge: "GATE",
      tags: ["zap", "nuclei"], tone: "gateway", width: 192,
    },
    // 第二道闸: 卡 promote, 不卡 deploy。
    {
      id: "promote", x: 864, y: 344, label: "promote?", icon: ShieldCheck, badge: "GATE",
      tone: "gateway", width: 148,
    },
    {
      id: "prod", x: 1110, y: 344, label: "production", icon: Rocket, badge: "PROD",
      tone: "vendor", width: 174,
    },
    {
      id: "audit", x: 1310, y: 344, label: "audit", icon: ServerCog, badge: "REPORT",
      tone: "vendor", width: 132,
    },
  ];
}

const EDGES: FlowEdge[] = [
  { id: "checkout-koi", from: "checkout", to: "koi" },
  // 穿过 CI 框和构建框的边界 —— 门禁就卡在这条线上。
  { id: "koi-install", from: "koi", to: "install" },
  { id: "install-build", from: "install", to: "build" },
  { id: "build-push", from: "build", to: "push" },
  // 唯一一条跨排的线: 制品做好了, 去预发跑起来。
  { id: "push-staging", from: "push", to: "staging" },
  { id: "staging-redteam", from: "staging", to: "redteam" },
  { id: "redteam-pentest", from: "redteam", to: "pentest" },
  { id: "pentest-promote", from: "pentest", to: "promote" },
  { id: "promote-prod", from: "promote", to: "prod" },
  // 部署后审计是旁路: 不阻断, 只记录实际落地的是什么。
  { id: "prod-audit", from: "prod", to: "audit", dashed: true },
];

function buildFrames(mode: Mode, t: (k: any) => string): Frame[] {
  const frames: Frame[] = [
    {
      key: "checkout", title: t("sc.f.checkout"), ok: true,
      nodes: ["checkout"], edges: [],
      rows: [["scans", "requirements.txt · package.json · ai-tools.yaml"]],
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
    // 拦下就到此为止 —— 后面每一步都确实没有发生, 所以一步都不画。
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
      rows: [["runs", "setup.py · postinstall"], ["note", t("sc.installNote")]],
    },
    {
      key: "build", title: t("sc.f.build"), ok: true,
      nodes: ["install", "build"], edges: ["install-build"],
      rows: [["images", "backend · frontend"]],
    },
    {
      key: "push", title: t("sc.f.push"), ok: true,
      nodes: ["build", "push"], edges: ["build-push"],
      rows: [["registry", "harbor · :BUILD_NUMBER"]],
    },
    {
      key: "staging", title: t("sc.f.staging"), ok: true,
      nodes: ["push", "staging"], edges: ["push-staging"],
      rows: [["why", t("sc.stagingWhy")], ["then", "health · smoke"]],
    },
    {
      key: "redteam", title: t("sc.f.redteam"), ok: true,
      nodes: ["staging", "redteam"], edges: ["staging-redteam"],
      rows: [["scope", t("sc.redteamScope")], ["target", t("sc.againstStaging")]],
    },
    {
      key: "pentest", title: t("sc.f.pentest"), ok: true,
      nodes: ["redteam", "pentest"], edges: ["redteam-pentest"],
      rows: [["scope", t("sc.pentestScope")], ["target", t("sc.againstStaging")]],
    },
    {
      key: "promote", title: t("sc.f.promote"), ok: true,
      nodes: ["pentest", "promote"], edges: ["pentest-promote"],
      rows: [["gates", t("sc.promoteGates")], ["blocks", t("sc.promoteBlocks")]],
    },
    {
      key: "prod", title: t("sc.f.prod"), ok: true,
      nodes: ["promote", "prod"], edges: ["promote-prod"],
      rows: [["deploys", t("sc.prodDeploys")]],
    },
    {
      key: "audit", title: t("sc.f.audit"), ok: true,
      nodes: ["prod", "audit"], edges: ["prod-audit"],
      rows: [["scope", t("sc.auditScope")], ["blocking", t("sc.auditNonBlocking")]],
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
      minWidth={1120}
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
