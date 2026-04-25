export const recommendedCardStyle = {
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  height: "100%",
} as const;

export const recommendedCardBodyStyle = {
  display: "grid",
  gap: 14,
  alignContent: "start",
  flex: 1,
} as const;

export const recommendedActionGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  marginTop: "auto",
} as const;

export const recommendedActionButtonStyle = {
  width: "100%",
  minHeight: 40,
} as const;
