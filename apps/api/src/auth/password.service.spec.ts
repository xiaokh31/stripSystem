import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  it('hashes passwords without storing plaintext and verifies the original password', async () => {
    const hash = await service.hashPassword('Correct#123');

    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('Correct#123');
    await expect(service.verifyPassword('Correct#123', hash)).resolves.toBe(
      true,
    );
  });

  it('rejects wrong passwords and unsupported hash formats', async () => {
    const hash = await service.hashPassword('Correct#123');

    await expect(service.verifyPassword('wrong-password', hash)).resolves.toBe(
      false,
    );
    await expect(
      service.verifyPassword('Correct#123', 'plaintext-password'),
    ).resolves.toBe(false);
    await expect(service.verifyPassword('Correct#123', null)).resolves.toBe(
      false,
    );
  });
});
