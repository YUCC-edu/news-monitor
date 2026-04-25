export type UiLocale = "zh-CN" | "en-US";
export type ThemeName = "dark" | "light" | "paper";

export const UI_LOCALE_STORAGE_KEY = "nm_ui_locale_v1";
export const THEME_STORAGE_KEY = "nm_theme_v1";

export function normalizeUiLocale(value: string | null | undefined): UiLocale {
  return value === "en-US" ? "en-US" : "zh-CN";
}

export function normalizeTheme(value: string | null | undefined): ThemeName {
  if (value === "light" || value === "paper") return value;
  return "dark";
}

export function getPreferredContent(
  item: {
    title?: string | null;
    titleZh?: string | null;
    contentText?: string | null;
    contentZh?: string | null;
  },
  locale: UiLocale,
  field: "title" | "content",
) {
  if (field === "title") {
    return locale === "zh-CN"
      ? item.titleZh ?? item.title ?? ""
      : item.title ?? item.titleZh ?? "";
  }
  return locale === "zh-CN"
    ? item.contentZh ?? item.contentText ?? ""
    : item.contentText ?? item.contentZh ?? "";
}

const COPY = {
  "zh-CN": {
    appearanceLabel: "外观",
    languageLabel: "界面语言",
    settingsTitle: "设置",
    quickSwitchTitle: "快速切换",
    themeLabel: "主题",
    themeDark: "暗色",
    themeLight: "亮色",
    themePaper: "羊皮纸",
    languageChinese: "中文",
    languageEnglish: "English",
    openSettings: "打开设置",
  },
  "en-US": {
    appearanceLabel: "Appearance",
    languageLabel: "Interface Language",
    settingsTitle: "Settings",
    quickSwitchTitle: "Quick Switch",
    themeLabel: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    themePaper: "Paper",
    languageChinese: "中文",
    languageEnglish: "English",
    openSettings: "Open Settings",
  },
} as const;

export function getUiCopy(locale: UiLocale) {
  return COPY[locale];
}
