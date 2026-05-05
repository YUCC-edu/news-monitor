export const wanderVisualStyle = {
  brand: "Wander云上",
  positive: [
    "Wander云上 brand signal",
    "black-and-white editorial technology poster",
    "white fine line-art on deep black background",
    "stamp/postcard border",
    "small yellow V badge accent",
    "low text density",
    "clean information layout",
    "subtle clouds, waves, mountains, lighthouse, geometric UI lines",
    "16:9 WeChat article image",
  ],
  negative: [
    "stock photo",
    "generic gradient background",
    "colorful cyberpunk palette",
    "dense unreadable text",
    "messy UI collage",
    "photorealistic corporate people",
    "large random English typography",
  ],
};

export type WanderImageKind = "cover" | "section" | "ending";

export function buildWanderImagePrompt(input: {
  kind: WanderImageKind;
  topic: string;
  scene: string;
}) {
  const role =
    input.kind === "cover"
      ? "opening cover with a calm creator-at-laptop scene and wide title-safe space"
      : input.kind === "ending"
        ? "closing postcard with centered brand seal, clouds, mountains, and a concise final statement area"
        : "structured infographic card with modular panels, icons, arrows, and clean section labels";
  return [
    `Create a ${role}.`,
    `Topic: ${input.topic}.`,
    `Scene: ${input.scene}.`,
    ...wanderVisualStyle.positive,
    "Use Chinese text only when necessary; keep text large, sparse, and readable.",
    "No exact logo recreation is required, but preserve the Wander云上 visual identity and the yellow V badge accent.",
  ].join(" ");
}

export function buildWanderNegativePrompt() {
  return wanderVisualStyle.negative.join(", ");
}
