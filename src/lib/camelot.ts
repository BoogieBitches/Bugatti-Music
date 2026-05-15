// Camelot wheel key colors for harmonic mixing display.
// Keys 1-12, each with A (minor) and B (major) variants.

const CAMELOT_COLORS: Record<string, string> = {
  "1A": "#E040FB",  "1B": "#CE93D8",
  "2A": "#F44336",  "2B": "#EF9A9A",
  "3A": "#FF5722",  "3B": "#FFAB91",
  "4A": "#FF9800",  "4B": "#FFCC80",
  "5A": "#FDD835",  "5B": "#FFF59D",
  "6A": "#8BC34A",  "6B": "#DCEDC8",
  "7A": "#4CAF50",  "7B": "#A5D6A7",
  "8A": "#00BCD4",  "8B": "#80DEEA",
  "9A": "#03A9F4",  "9B": "#81D4FA",
  "10A": "#2196F3", "10B": "#90CAF9",
  "11A": "#3F51B5", "11B": "#9FA8DA",
  "12A": "#9C27B0", "12B": "#CE93D8",
};

export function camelotColor(key: string): string {
  return CAMELOT_COLORS[key] ?? "#888888";
}

export const CAMELOT_KEYS = [
  "1A","1B","2A","2B","3A","3B","4A","4B",
  "5A","5B","6A","6B","7A","7B","8A","8B",
  "9A","9B","10A","10B","11A","11B","12A","12B",
] as const;
