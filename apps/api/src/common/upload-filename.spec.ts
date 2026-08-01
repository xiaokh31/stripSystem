import {
  assertStorageContainment,
  canonicalizeUploadFilename,
  contentDispositionAttachment,
  FILENAME_REVIEW_CODES,
} from './upload-filename';

describe('upload filename codec', () => {
  const sha = 'a'.repeat(64);

  it.each([
    ['plan.xlsx', 'plan.xlsx'],
    ['卸柜清单.xlsx', '卸柜清单.xlsx'],
    ['社員一覧.xlsx', '社員一覧.xlsx'],
    ['직원목록.xlsx', '직원목록.xlsx'],
    ['café.xlsx', 'café.xlsx'],
    ['emoji-📦.xlsx', 'emoji-📦.xlsx'],
    ['space (copy).xlsx', 'space (copy).xlsx'],
  ])('preserves canonical %s', (input, expected) => {
    const result = canonicalizeUploadFilename(input, '.xlsx', sha);
    expect(result.originalFilename).toBe(expected);
    expect(result.recoveredTransportEncoding).toBe(false);
    expect(result.reviewCode).toBeNull();
  });

  it('normalizes NFD to NFC without treating it as mojibake', () => {
    const result = canonicalizeUploadFilename(
      'cafe\u0301.xlsx',
      '.xlsx',
      sha,
    );
    expect(result.originalFilename).toBe('café.xlsx');
    expect(result.normalized).toBe(true);
    expect(result.recoveredTransportEncoding).toBe(false);
  });

  it('recovers one strict reversible Latin-1 transport decode only once', () => {
    const transport = Buffer.from('1_(7月)员工刷卡记录表.xls', 'utf8').toString(
      'latin1',
    );
    const first = canonicalizeUploadFilename(transport, '.xls', sha);
    const second = canonicalizeUploadFilename(
      first.originalFilename,
      '.xls',
      sha,
    );
    expect(first.originalFilename).toBe('1_(7月)员工刷卡记录表.xls');
    expect(first.recoveredTransportEncoding).toBe(true);
    expect(second.originalFilename).toBe(first.originalFilename);
    expect(second.recoveredTransportEncoding).toBe(false);
  });

  it('preserves ambiguous or invalid transport names with stable review codes', () => {
    expect(
      canonicalizeUploadFilename('broken-Ã.xlsx', '.xlsx', sha).reviewCode,
    ).toBe(FILENAME_REVIEW_CODES.ambiguousEncoding);
    expect(
      canonicalizeUploadFilename('broken-\uFFFD.xlsx', '.xlsx', sha).reviewCode,
    ).toBe(FILENAME_REVIEW_CODES.invalidUtf8);
  });

  it.each(['../escape.xlsx', '..\\escape.xlsx'])(
    'creates a bounded storage basename for %s',
    (input) => {
      const result = canonicalizeUploadFilename(input, '.xlsx', sha);
      expect(result.storageBasename).not.toMatch(/[\\/\r\n]/u);
      expect(Buffer.byteLength(result.storageBasename, 'utf8')).toBeLessThanOrEqual(
        180,
      );
    },
  );

  it('removes C0/C1 and bidi controls from storage basenames', () => {
    const result = canonicalizeUploadFilename(
      `line${String.fromCharCode(13, 10)}break\u202E.xlsx`,
      '.xlsx',
      sha,
    );
    expect(result.storageBasename).not.toMatch(/[\r\n\u202E]/u);
    expect(result.reviewCode).toBe(FILENAME_REVIEW_CODES.unsafeCharacters);
  });

  it('bounds very long names by UTF-8 bytes and preserves the extension', () => {
    const result = canonicalizeUploadFilename(
      `${'仓'.repeat(500)}.xlsx`,
      '.xlsx',
      sha,
    );
    expect(result.reviewCode).toBe(FILENAME_REVIEW_CODES.tooLong);
    expect(result.storageBasename.endsWith('.xlsx')).toBe(true);
    expect(Buffer.byteLength(result.storageBasename, 'utf8')).toBeLessThanOrEqual(
      180,
    );
  });

  it('fails containment checks and emits injection-safe download headers', () => {
    expect(() => assertStorageContainment('/tmp/root', '../escape.xlsx')).toThrow(
      'UPLOAD_STORAGE_PATH_OUTSIDE_ROOT',
    );
    const header = contentDispositionAttachment('工资\r\nX-Test: yes.xls');
    expect(header).not.toMatch(/[\r\n]/u);
    expect(header).toContain("filename*=UTF-8''");
  });
});
