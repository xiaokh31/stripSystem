import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const HASH_FORMAT = 'scrypt';
const KEY_LENGTH = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

@Injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await this.deriveKey(password, salt, {
      n: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      keyLength: KEY_LENGTH,
    });

    return [
      HASH_FORMAT,
      SCRYPT_N,
      SCRYPT_R,
      SCRYPT_P,
      KEY_LENGTH,
      salt.toString('base64url'),
      derivedKey.toString('base64url'),
    ].join('$');
  }

  async verifyPassword(
    password: string,
    passwordHash: string | null,
  ): Promise<boolean> {
    if (!passwordHash) {
      return false;
    }

    const parsed = this.parseHash(passwordHash);
    if (!parsed) {
      return false;
    }

    const derivedKey = await this.deriveKey(password, parsed.salt, parsed);
    return (
      derivedKey.length === parsed.hash.length &&
      timingSafeEqual(derivedKey, parsed.hash)
    );
  }

  private async deriveKey(
    password: string,
    salt: Buffer,
    parameters: ScryptParameters,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        parameters.keyLength,
        {
          N: parameters.n,
          r: parameters.r,
          p: parameters.p,
          maxmem: 64 * 1024 * 1024,
        },
        (error, derivedKey) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(derivedKey);
        },
      );
    });
  }

  private parseHash(passwordHash: string): ParsedHash | null {
    const [format, n, r, p, keyLength, salt, hash] = passwordHash.split('$');
    if (
      format !== HASH_FORMAT ||
      !n ||
      !r ||
      !p ||
      !keyLength ||
      !salt ||
      !hash
    ) {
      return null;
    }

    const parameters = {
      n: Number.parseInt(n, 10),
      r: Number.parseInt(r, 10),
      p: Number.parseInt(p, 10),
      keyLength: Number.parseInt(keyLength, 10),
    };
    if (
      !Number.isSafeInteger(parameters.n) ||
      !Number.isSafeInteger(parameters.r) ||
      !Number.isSafeInteger(parameters.p) ||
      !Number.isSafeInteger(parameters.keyLength) ||
      parameters.n <= 1 ||
      parameters.r <= 0 ||
      parameters.p <= 0 ||
      parameters.keyLength <= 0
    ) {
      return null;
    }

    try {
      return {
        ...parameters,
        salt: Buffer.from(salt, 'base64url'),
        hash: Buffer.from(hash, 'base64url'),
      };
    } catch {
      return null;
    }
  }
}

interface ScryptParameters {
  n: number;
  r: number;
  p: number;
  keyLength: number;
}

interface ParsedHash extends ScryptParameters {
  salt: Buffer;
  hash: Buffer;
}
