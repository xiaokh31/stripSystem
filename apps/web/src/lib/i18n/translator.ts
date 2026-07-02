import {
  DEFAULT_LOCALE,
  I18N_DYNAMIC_TRANSLATIONS,
  LOCALE_MESSAGES,
  SUPPORTED_LOCALES,
  type Locale,
} from "./catalog";

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (isSupportedLocale(value)) {
    return value;
  }

  if (value?.toLowerCase().startsWith("zh")) {
    return "zh-CN";
  }

  return DEFAULT_LOCALE;
}

export function translateTextContent(value: string, locale: Locale): string {
  if (!value.trim()) {
    return value;
  }

  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const leading = match?.[1] ?? "";
  const content = match?.[2] ?? value;
  const trailing = match?.[3] ?? "";
  const normalized = content.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return value;
  }

  const translated = translateMessage(normalized, locale);

  if (!translated || translated === normalized) {
    return value;
  }

  return `${leading}${translated}${trailing}`;
}

export function translateAttributeValue(value: string, locale: Locale): string {
  return translateTextContent(value, locale);
}

export function translateMessage(value: string, locale: Locale): string | null {
  const targetMessages = LOCALE_MESSAGES[locale];
  const sourceKey = findSourceKey(value);

  if (sourceKey) {
    return targetMessages[sourceKey] ?? null;
  }

  for (const pattern of I18N_DYNAMIC_TRANSLATIONS) {
    const match = value.match(pattern.source);
    if (match) {
      return pattern.render[locale](match);
    }
  }

  return null;
}

function findSourceKey(value: string): keyof typeof LOCALE_MESSAGES.en | null {
  for (const sourceKey of Object.keys(LOCALE_MESSAGES.en) as Array<
    keyof typeof LOCALE_MESSAGES.en
  >) {
    if (
      LOCALE_MESSAGES.en[sourceKey] === value ||
      LOCALE_MESSAGES["zh-CN"][sourceKey] === value
    ) {
      return sourceKey;
    }
  }

  return null;
}
