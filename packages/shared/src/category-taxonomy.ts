export type TaxonomyDimension = "domain" | "topic" | "entity";

const DOMAIN_RULES: Array<{ value: string; keywords: string[] }> = [
  { value: "基础模型", keywords: ["model", "llm", "foundation model", "大模型", "基座", "预训练"] },
  { value: "AI应用", keywords: ["agent", "copilot", "应用", "workflow", "automation"] },
  { value: "算力与基础设施", keywords: ["gpu", "npu", "chip", "算力", "数据中心", "cuda"] },
  { value: "监管与安全", keywords: ["regulation", "compliance", "security", "监管", "合规", "安全"] },
];

const TOPIC_RULES: Array<{ value: string; keywords: string[] }> = [
  { value: "模型发布", keywords: ["release", "launch", "发布", "发布会"] },
  { value: "推理优化", keywords: ["inference", "latency", "quantization", "推理", "量化"] },
  { value: "开源项目", keywords: ["open source", "github", "开源"] },
  { value: "行业落地", keywords: ["enterprise", "industry", "case study", "行业", "落地"] },
];

const ENTITY_RULES: Array<{ value: string; keywords: string[] }> = [
  { value: "OpenAI", keywords: ["openai", "gpt"] },
  { value: "Anthropic", keywords: ["anthropic", "claude"] },
  { value: "Google", keywords: ["google", "gemini", "deepmind"] },
  { value: "Meta", keywords: ["meta", "llama"] },
  { value: "DeepSeek", keywords: ["deepseek"] },
  { value: "NVIDIA", keywords: ["nvidia"] },
];

function normalize(values: string[] | null | undefined) {
  return [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))];
}

function matchByRules(text: string, rules: Array<{ value: string; keywords: string[] }>) {
  const found: string[] = [];
  for (const rule of rules) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      found.push(rule.value);
    }
  }
  return found;
}

export function deriveTaxonomy(input: {
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
  const domain = normalize([...matchByRules(text, DOMAIN_RULES), ...(input.llmDomain ?? [])]);
  const topic = normalize([...matchByRules(text, TOPIC_RULES), ...(input.llmTopic ?? [])]);
  const entity = normalize([...matchByRules(text, ENTITY_RULES), ...(input.llmEntity ?? [])]);
  return { domain, topic, entity };
}
