import {
  compareContainerNumbers,
  escapeSqlLikePattern,
  normalizeContainerSearchValue,
} from './container-search';

describe('container search helpers', () => {
  it('shares one case-insensitive normalization and literal SQL LIKE escaping contract', () => {
    expect(normalizeContainerSearchValue('  Ab12  ')).toBe('ab12');
    expect(escapeSqlLikePattern(String.raw`a%_\\b`)).toBe(
      String.raw`a\%\_\\\\b`,
    );
  });

  it('compares ASCII/alphanumeric chunks case-insensitively and treats leading zero variants as ties', () => {
    expect(compareContainerNumbers('A2', 'a10')).toBeLessThan(0);
    expect(compareContainerNumbers('AB2', 'ab02')).toBe(0);
    expect(compareContainerNumbers('Z9', 'a10')).toBeGreaterThan(0);
  });
});
