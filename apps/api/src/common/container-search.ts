export function normalizeContainerSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase('en-CA');
}

export function escapeSqlLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function compareContainerNumbers(left: string, right: string): number {
  const leftChunks = alphaNumericChunks(normalizeContainerSearchValue(left));
  const rightChunks = alphaNumericChunks(normalizeContainerSearchValue(right));
  const chunkCount = Math.max(leftChunks.length, rightChunks.length);

  for (let index = 0; index < chunkCount; index += 1) {
    const leftChunk = leftChunks[index];
    const rightChunk = rightChunks[index];
    if (leftChunk === undefined) return -1;
    if (rightChunk === undefined) return 1;

    const comparison = compareChunk(leftChunk, rightChunk);
    if (comparison !== 0) return comparison;
  }

  return 0;
}

function alphaNumericChunks(value: string): string[] {
  return value.match(/\d+|\D+/g) ?? [];
}

function compareChunk(left: string, right: string): number {
  const leftIsNumber = /^\d+$/.test(left);
  const rightIsNumber = /^\d+$/.test(right);

  if (leftIsNumber && rightIsNumber) {
    const normalizedLeft = left.replace(/^0+(?=\d)/, '');
    const normalizedRight = right.replace(/^0+(?=\d)/, '');
    if (normalizedLeft.length !== normalizedRight.length) {
      return normalizedLeft.length - normalizedRight.length;
    }
    return asciiCompare(normalizedLeft, normalizedRight);
  }

  return asciiCompare(left, right);
}

function asciiCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
