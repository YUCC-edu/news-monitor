export const CONTROLLED_TAGS = [
  "Agent",
  "模型发布",
  "编码",
  "大佬观点",
  "安全",
  "数据集",
  "多模态",
  "推理",
  "硬件",
  "行业新闻",
] as const;

export type ControlledTag = (typeof CONTROLLED_TAGS)[number];

export function isControlledTag(s: string): s is ControlledTag {
  return (CONTROLLED_TAGS as readonly string[]).includes(s);
}
