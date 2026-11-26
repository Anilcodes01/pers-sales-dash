export const themeColors = [
  { id: "blue", label: "Blue", color: "#0088c7" },
  { id: "green", label: "Green", color: "#008464" },
  { id: "violet", label: "Violet", color: "#7c3aed" },
  { id: "rose", label: "Rose", color: "#e21550" },
  { id: "orange", label: "Orange", color: "#c43e08" },
  { id: "teal", label: "Teal", color: "#0d7b78" },
] as const;
export function isThemeColor(value: unknown): value is typeof themeColors[number]["id"] {
  return themeColors.some(option => option.id === value);
}
