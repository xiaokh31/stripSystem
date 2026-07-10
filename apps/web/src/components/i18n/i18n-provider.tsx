"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/catalog";
import {
  persistBrowserLocale,
  readBrowserLocale,
} from "@/lib/i18n/browser";
import {
  normalizeLocale,
  translateAttributeValue,
  translateTextContent,
} from "@/lib/i18n/translator";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
});

const TRANSLATABLE_ATTRIBUTES = [
  "alt",
  "aria-description",
  "aria-label",
  "placeholder",
  "title",
] as const;

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const browserLocale = readBrowserLocale();
      if (browserLocale) {
        setLocaleState((currentLocale) =>
          browserLocale === currentLocale ? currentLocale : browserLocale,
        );
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    persistBrowserLocale(locale);
    translateDocument(locale);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          translateNode(node, locale);
        }

        if (
          mutation.type === "characterData" &&
          mutation.target.nodeType === Node.TEXT_NODE
        ) {
          translateTextNode(mutation.target as Text, locale);
        }

        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          translateElementAttributes(mutation.target, locale);
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(normalizeLocale(nextLocale));
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function translateDocument(locale: Locale): void {
  translateNode(document.body, locale);
}

function translateNode(node: Node, locale: Locale): void {
  if (shouldSkipNode(node)) {
    return;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    translateTextNode(node as Text, locale);
    return;
  }

  if (!(node instanceof Element)) {
    return;
  }

  translateElementAttributes(node, locale);

  const walker = document.createTreeWalker(
    node,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (textNode) =>
        shouldSkipNode(textNode)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    },
  );

  let textNode = walker.nextNode();
  while (textNode) {
    translateTextNode(textNode as Text, locale);
    textNode = walker.nextNode();
  }

  for (const element of node.querySelectorAll("*")) {
    translateElementAttributes(element, locale);
  }
}

function translateTextNode(node: Text, locale: Locale): void {
  const translated = translateTextContent(node.data, locale);
  if (translated !== node.data) {
    node.data = translated;
  }
}

function translateElementAttributes(element: Element, locale: Locale): void {
  if (shouldSkipNode(element)) {
    return;
  }

  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (!value) {
      continue;
    }

    const translated = translateAttributeValue(value, locale);
    if (translated !== value) {
      element.setAttribute(attribute, translated);
    }
  }
}

function shouldSkipNode(node: Node): boolean {
  const element =
    node instanceof Element ? node : node.parentElement;

  if (!element) {
    return false;
  }

  return Boolean(
    element.closest(
      "script, style, code, pre, [data-i18n-ignore='true'], [data-i18n-ignore]",
    ),
  );
}
