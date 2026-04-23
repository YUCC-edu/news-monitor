export type TaxonomyDimension = "domain" | "topic" | "entity";

type Rule = {
  value: string;
  keywords: string[];
  aliases?: string[];
  blacklist?: string[];
  priority?: number;
};

type TaxonomySource = "rule" | "llm" | "mixed";

const DOMAIN_RULES: Rule[] = [
  {
    value: "基础模型",
    keywords: ["model", "llm", "foundation model", "大模型", "基座", "预训练"],
    aliases: ["language model", "chat model", "模型权重"],
    priority: 3,
  },
  {
    value: "AI应用",
    keywords: ["agent", "copilot", "应用", "workflow", "automation"],
    aliases: ["assistant", "智能体", "自动化流程"],
    priority: 2,
  },
  {
    value: "算力与基础设施",
    keywords: ["gpu", "npu", "chip", "算力", "数据中心", "cuda"],
    aliases: ["infrastructure", "cluster", "集群", "推理服务"],
    priority: 2,
  },
  {
    value: "监管与安全",
    keywords: ["regulation", "compliance", "security", "监管", "合规", "安全"],
    aliases: ["policy", "governance", "风险", "审计"],
    priority: 3,
  },
  {
    value: "开发者工具链",
    keywords: ["ide", "sdk", "cli", "插件", "开发工具"],
    aliases: ["vscode", "cursor", "copilot workspace", "agentic coding"],
    priority: 2,
  },
];

const TOPIC_RULES: Rule[] = [
  {
    value: "模型发布",
    keywords: ["release", "launch", "发布", "发布会"],
    aliases: ["announce", "introducing", "推出"],
    priority: 3,
  },
  {
    value: "推理优化",
    keywords: ["inference", "latency", "quantization", "推理", "量化"],
    aliases: ["throughput", "优化", "压缩"],
    priority: 2,
  },
  {
    value: "开源项目",
    keywords: ["open source", "github", "开源"],
    aliases: ["oss", "repo", "许可证"],
    priority: 1,
  },
  {
    value: "行业落地",
    keywords: ["enterprise", "industry", "case study", "行业", "落地"],
    aliases: ["production", "部署", "客户案例"],
    priority: 1,
  },
  {
    value: "数据与评测",
    keywords: ["benchmark", "eval", "leaderboard", "测评", "基准"],
    aliases: ["arena", "评测集", "score"],
    priority: 2,
  },
];

const ENTITY_RULES: Rule[] = [
  { value: "OpenAI", keywords: ["openai", "gpt"], aliases: ["chatgpt", "o1", "o3"], priority: 4 },
  { value: "Anthropic", keywords: ["anthropic", "claude"], aliases: ["opus", "sonnet"], priority: 4 },
  {
    value: "Google",
    keywords: ["google", "gemini", "deepmind"],
    aliases: ["vertex ai", "alphabet"],
    priority: 3,
  },
  { value: "Meta", keywords: ["meta", "llama"], aliases: ["facebook ai"], priority: 3 },
  { value: "DeepSeek", keywords: ["deepseek"], aliases: ["deep seek"], priority: 3 },
  { value: "NVIDIA", keywords: ["nvidia"], aliases: ["h100", "blackwell"], priority: 3 },
  { value: "Microsoft", keywords: ["microsoft"], aliases: ["azure ai", "copilot"], priority: 3 },
  { value: "AWS", keywords: ["aws"], aliases: ["bedrock", "sagemaker"], priority: 3 },
];

function normalize(values: string[] | null | undefined) {
  return [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))];
}

function scoreByRules(text: string, rules: Rule[]) {
  const found = new Map<string, number>();
  for (const rule of rules) {
    const keys = [...rule.keywords, ...(rule.aliases ?? [])];
    const hit = keys.filter((kw) => text.includes(kw)).length;
    if (hit <= 0) continue;
    if ((rule.blacklist ?? []).some((kw) => text.includes(kw))) continue;
    const score = hit + (rule.priority ?? 1);
    found.set(rule.value, Math.max(found.get(rule.value) ?? 0, score));
  }
  return [...found.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .map(([value]) => value);
}

function filterLLMByEvidence(text: string, values: string[] | null | undefined) {
  const list = normalize(values);
  if (list.length === 0) return [];
  const withEvidence = list.filter((v) => text.includes(v.toLowerCase()));
  if (withEvidence.length > 0) return withEvidence;
  return list.slice(0, 2);
}

function resolveConflicts(values: string[], dimension: TaxonomyDimension) {
  if (dimension === "domain") {
    if (values.includes("基础模型") && values.includes("AI应用")) {
      return values.filter((v) => v !== "AI应用");
    }
    if (values.includes("监管与安全") && values.includes("开发者工具链")) {
      return values.filter((v) => v !== "开发者工具链");
    }
  }
  if (dimension === "topic") {
    if (values.includes("模型发布") && values.includes("行业落地")) {
      return values.filter((v) => v !== "行业落地");
    }
  }
  return values;
}

function inferSource(ruleValues: string[], llmValues: string[], merged: string[]): TaxonomySource {
  const hasRule = merged.some((v) => ruleValues.includes(v));
  const hasLlm = merged.some((v) => llmValues.includes(v));
  if (hasRule && hasLlm) return "mixed";
  if (hasRule) return "rule";
  return "llm";
}

export function deriveTaxonomyWithMeta(input: {
  title?: string | null;
  content?: string | null;
  tags?: string[] | null;
  llmDomain?: string[] | null;
  llmTopic?: string[] | null;
  llmEntity?: string[] | null;
}) {
  const text = `${input.title ?? ""}\n${input.content ?? ""}\n${(input.tags ?? []).join(" ")}`
    .toLowerCase()
    .trim();
  const ruleDomain = scoreByRules(text, DOMAIN_RULES);
  const ruleTopic = scoreByRules(text, TOPIC_RULES);
  const ruleEntity = scoreByRules(text, ENTITY_RULES);
  const llmDomain = filterLLMByEvidence(text, input.llmDomain);
  const llmTopic = filterLLMByEvidence(text, input.llmTopic);
  const llmEntity = filterLLMByEvidence(text, input.llmEntity);
  const domain = resolveConflicts(normalize([...ruleDomain, ...llmDomain]), "domain");
  const topic = resolveConflicts(normalize([...ruleTopic, ...llmTopic]), "topic");
  const entity = resolveConflicts(normalize([...ruleEntity, ...llmEntity]), "entity");
  const confidence = {
    domain: Math.min(1, domain.length > 0 ? 0.6 + Math.min(ruleDomain.length, 3) * 0.1 : 0.25),
    topic: Math.min(1, topic.length > 0 ? 0.55 + Math.min(ruleTopic.length, 3) * 0.1 : 0.25),
    entity: Math.min(1, entity.length > 0 ? 0.65 + Math.min(ruleEntity.length, 3) * 0.08 : 0.25),
  };
  const source = {
    domain: inferSource(ruleDomain, llmDomain, domain),
    topic: inferSource(ruleTopic, llmTopic, topic),
    entity: inferSource(ruleEntity, llmEntity, entity),
  };
  return { domain, topic, entity, confidence, source };
}

export function deriveTaxonomy(input: {
  title?: string | null;
  content?: string | null;
  tags?: string[] | null;
  llmDomain?: string[] | null;
  llmTopic?: string[] | null;
  llmEntity?: string[] | null;
}) {
  const out = deriveTaxonomyWithMeta(input);
  return { domain: out.domain, topic: out.topic, entity: out.entity };
}
