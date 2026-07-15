import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/containers/[id]/page.tsx"),
  "utf8",
);

test("container detail keeps the operational sections in destination-first DOM order", () => {
  const renderedComponents = [
    "<ContainerStatusControl",
    "<ContainerDestinationCorrections",
    "<ContainerUnloadingWagePanel",
    "<ContainerInventoryAdjustmentPanel",
    "<ContainerGeneratedFiles",
  ];
  const positions = renderedComponents.map((component) => {
    const position = pageSource.indexOf(component);
    assert.notEqual(position, -1, `${component} must remain rendered`);
    return position;
  });

  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.doesNotMatch(pageSource, /\border-(?:first|last|none|\d+)\b/);
});

test("container detail reordering does not duplicate or serialize its API loaders", () => {
  assert.equal(matchCount(/await getContainerDetail\(/g), 1);
  assert.equal(matchCount(/await getContainerGeneratedFiles\(/g), 1);
  assert.equal(matchCount(/await listUnloadingWageWorkers\(/g), 1);
  assert.equal(matchCount(/getContainerInventoryDetailSummary\(/g), 1);
  assert.equal(matchCount(/listInventoryAdjustments\(/g), 1);
  assert.match(pageSource, /await Promise\.allSettled\(\[/);
  assert.match(pageSource, /const inventoryAdjustmentState = canReadInventory\s+\?/);
  assert.match(pageSource, /\{inventoryAdjustmentState \? \(/);
});

function matchCount(pattern: RegExp): number {
  return pageSource.match(pattern)?.length ?? 0;
}
