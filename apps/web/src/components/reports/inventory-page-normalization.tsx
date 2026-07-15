"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "../i18n/i18n-provider";

export function InventoryPageNormalization({
  href,
}: {
  href: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  useEffect(() => {
    router.replace(href, { scroll: false });
  }, [href, router]);

  return (
    <p
      className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
      role="status"
    >
      {t("The inventory page was moved to the last available page.")}
    </p>
  );
}
