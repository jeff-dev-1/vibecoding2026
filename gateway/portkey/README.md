# Portkey vs Envoy AI Gateway — 对比页

> **背景**：Portkey 是 SaaS AI Gateway，2025 年起被 Palo Alto Networks 收购整合进 Prisma AIRS 产品线。
> 这份对比给售前/解决方案用——客户问"我已经在看 Portkey 了，你们为什么推 Envoy"时，**不要回避**，逐项说差异。

## 一句话定位

| 维度 | Envoy AI Gateway | Portkey |
|---|---|---|
| 形态 | OSS + 自托管 (K8s/VM) | SaaS 优先，私有化次之 |
| 归属 | Envoy / CNCF | Palo Alto Networks (2025) |
| 上手成本 | 高（要 K8s + Gateway API 概念） | 低（注册即用） |
| 私有化程度 | 完全私有，数据不出公司 | 私有化版有，但默认 SaaS |
| 合规故事 | "我们自己跑" | "Palo Alto 的 SOC2/ISO" |
| 与现有 Envoy 栈 | 原生兼容 | 独立产品，需对接 |

## 功能对照

| 能力 | Envoy AI Gateway | Portkey | Demo 演示位置 |
|---|---|---|---|
| 多模型路由 | `AIGatewayRoute.rules` weight + matches | Virtual Keys + Routes | `config/ai-gateway-route.yaml` |
| 鉴权 | `BackendSecurityPolicy` + API Key/JWT/OIDC | Virtual Key + workspace ACL | `envoy.yaml` Lua bearer |
| Rate Limit | Token-based + Request-based | Token / RPM / TPM | `policy-rate-limit.yaml` |
| 语义缓存 | `BackendTrafficPolicy.cache` | 内置 (Redis) | `policy-rate-limit.yaml` |
| Guardrail | `AIGatewayGuardrail` + ext_proc 接 ML | 内置 30+ guardrail | `policy-guardrails.yaml` |
| PII 脱敏 | Guardrail PII rule | 内置 | 同上 |
| Prompt Injection | Guardrail + ProtectAI/NeMo | 内置 | 同上 |
| 观测 | OTel native | 自家 dashboard + OTel export | OTel Collector |
| Fallback | weight-based + circuit breaker | 自动 fallback chains | route weight |
| Fine-tune mgmt | 不管 | 管理 fine-tune jobs | n/a |
| MCP support | 通过 Envoy 上下文路由 | 暂未官方支持 | n/a |

## 选型建议（直接给客户）

| 客户场景 | 推荐 |
|---|---|
| 强合规、数据不出公司 | **Envoy AI Gateway**（私有化） |
| 已经在用 Envoy/Istio | **Envoy AI Gateway**（栈复用） |
| 团队没 K8s 经验，想快速 PoC | **Portkey** SaaS |
| 已经买了 Palo Alto Prisma AIRS | **Portkey** （已经在合同里） |
| 多云、跨 region | Portkey SaaS 省事；Envoy 要自己解决 |
| 想用 MCP 做 Agent 工具治理 | **Envoy AI Gateway**（更开放） |

## Demo 怎么讲

**售前话术**：
> "Portkey 像滴滴专车——叫一台过来就能跑，方便但你不掌握车。
> Envoy AI Gateway 像你公司自己的班车——自己买、自己开，**车在你院子里**。
> 客户问的不应该是'哪个更好'，而是'我的业务能不能让车开出我的院子'。"

## 配置对照样本

同样一件事——"加一个 OpenAI 上游 + 限流 1000 TPM"：

### Portkey（SaaS, 1 个 config.json）

```json
{
  "strategy": { "mode": "fallback" },
  "targets": [
    {
      "virtual_key": "openai-prod-x9k2",
      "override_params": { "model": "gpt-4o-mini" },
      "rate_limit": { "tokens": 1000, "unit": "minute" }
    }
  ]
}
```

参考 `config.json`。

### Envoy AI Gateway（K8s, 2 个 CRD）

```yaml
# AIServiceBackend + BackendTrafficPolicy
# (见 ../envoy-ai-gateway/config/ai-service-backend.yaml + policy-rate-limit.yaml)
```

**话术**：
> "Portkey 把 routing + auth + rate-limit 都塞在一个 JSON。优点是简单，缺点是它的概念模型必须接受。
> Envoy AI Gateway 分成 4-5 个 CRD。优点是和 K8s Gateway API 同构，运维同学不用学新东西。
> 选哪个**取决于运维团队**，不取决于功能。"
