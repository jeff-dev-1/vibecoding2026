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
  FileCheck,
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

const W = 1080;
const H = 380;

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
  { id: "ci", x: 30, y: 28, w: 390, h: 168, label: t("sc.groupCi"), tone: "supply" },
  { id: "artifact", x: 444, y: 28, w: 606, h: 168, label: t("sc.groupArtifact"), tone: "app" },
  // 下排在左, 因为流向是从右往左的 —— 走完预发这一路, 落在左下角的生产。
  { id: "prod", x: 26, y: 216, w: 356, h: 150, label: t("sc.groupProd"), tone: "vendor" },
  { id: "staging", x: 402, y: 216, w: 650, h: 150, label: t("sc.groupStaging"), tone: "gateway" },
];

function nodes(mode: Mode): FlowNode[] {
  // 除 Koi 之外都不带徽章。
  //
  // CI / INSTALL / BUILD / PUSH / DEPLOY / PROD 这些徽章和分组框名、节点标签说的是
  // 同一件事, 却占掉了节点大半宽度 —— 结果标签被截成 "check…" "b…" "pe…", 谁都读不出来。
  // 去掉之后整个宽度都归文字。
  //
  // Koi 的 PASS / BLOCK 留着: 它随剧本切换而变, 是这张图上唯一一个带状态的徽章。
  return [
    {
      id: "checkout", x: 118, y: 112, label: "checkout", icon: GitBranch,
      tags: ["git"], tone: "supply", width: 146,
    },
    // 第一道闸: 卡 install。落在 CI 框和构建框的边界上 —— "在 install 之前"由框线说出来。
    {
      id: "koi", x: 318, y: 112, label: "Koi Gate", icon: ScanLine,
      badge: mode === "block" ? "BLOCK" : "PASS",
      tags: ["pip", "npm", "mcp"],
      tone: mode === "block" ? "danger" : "supply", width: 176,
    },
    {
      id: "install", x: 540, y: 112, label: "install", icon: Boxes,
      tags: ["setup.py", "postinstall"], tone: "app", width: 168,
    },
    { id: "build", x: 740, y: 112, label: "build", icon: Hammer, tone: "app", width: 128 },
    { id: "push", x: 930, y: 112, label: "push", icon: PackageCheck, tone: "app", width: 128 },
    // 下排走蛇形: 从右往左。预发就在 registry push 的正下方, push → staging 因此是
    // 一条短竖线, 而不是横穿整张图的长对角线; 一路向左跑完两道对抗性验证和提升门禁,
    // 最后落在左下角的生产。节点的左右排列因此是 audit · production · promote · pentest ·
    // red team · staging, 读的时候从右往左。
    { id: "staging", x: 966, y: 300, label: "staging", icon: Rocket, tone: "gateway", width: 124 },
    {
      id: "redteam", x: 812, y: 300, label: "red team", icon: Swords,
      tags: ["injection"], tone: "gateway", width: 150,
    },
    {
      id: "pentest", x: 640, y: 300, label: "pentest", icon: Radar,
      tags: ["zap", "nuclei"], tone: "gateway", width: 152,
    },
    // 第二道闸: 卡 promote, 不卡 deploy。
    { id: "promote", x: 484, y: 300, label: "promote", icon: ShieldCheck, tone: "gateway", width: 126 },
    { id: "prod", x: 296, y: 300, label: "production", icon: Rocket, tone: "vendor", width: 146 },
    // 发布记录, 不是"再扫一遍"。
    //
    // 这里原来叫 audit, 对应的是把 Koi 门禁放在部署之后的那版流水线。门禁前移之后
    // 那个理由就没了。真要讲"门禁只是时点检查、生产会漂移", 正确画法是图外一条**定时**
    // 旁路 —— 漂移检测是 cron 跑的, 不是每次提交跑一遍的流水线阶段, 画成 deploy 后面
    // 的一个 stage 是把两种节奏混在一条线上。
    //
    // 这个位置真正属于流水线本次运行的, 是发布记录: 发的是哪个 digest、哪个 commit、
    // 过了哪几道闸、扫描报告存档在哪 —— 受监管客户被审计时要拿出来的就是这个。
    { id: "record", x: 124, y: 300, label: "release record", icon: FileCheck, tone: "vendor", width: 172 },
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
  // 发布记录是旁路: 不阻断, 只把"这次发了什么、过了哪些闸"落成档。
  { id: "prod-record", from: "prod", to: "record", dashed: true },
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
      key: "record", title: t("sc.f.record"), ok: true,
      nodes: ["prod", "record"], edges: ["prod-record"],
      rows: [
        ["records", t("sc.recordWhat")],
        ["why", t("sc.recordWhy")],
        ["note", t("sc.driftNote")],
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
      minWidth={900}
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
