import { permanentRedirect } from "next/navigation";
import {
  inventoryWorkspaceHref,
  normalizeInventoryFilters,
  normalizeInventorySelection,
  type InventorySearchParams,
} from "@/components/reports/inventory-report-flow";

export const dynamic = "force-dynamic";

export default async function LegacyInventoryReportPage({
  searchParams,
}: {
  searchParams: Promise<InventorySearchParams>;
}) {
  const query = await searchParams;
  permanentRedirect(
    inventoryWorkspaceHref(
      normalizeInventoryFilters(query),
      normalizeInventorySelection(query),
    ),
  );
}
