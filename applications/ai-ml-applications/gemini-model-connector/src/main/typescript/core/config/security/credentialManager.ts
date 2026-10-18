import { sysCrypto } from '@/core/utils/system/systemFacade.js';

export interface ICredentialManager {
  hashSecret(secret: string): string;
  generateApiKey(prefix?: string): string;
  verifySecret(provided: string, expectedHash: string): boolean;
}

export class CredentialManager implements ICredentialManager {
  public hashSecret(secret: string): string {
    return sysCrypto.sha256Hex(secret);
  }

  public generateApiKey(prefix = 'mb_sec'): string {
    return `${prefix}_${sysCrypto.randomBase64Url(24)}`;
  }

  public verifySecret(provided: string, expectedHash: string): boolean {
    const providedHash = this.hashSecret(provided);
    if (providedHash.length !== expectedHash.length) {
      return false;
    }
    return sysCrypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(expectedHash));
  }
}

export const credentialManager = new CredentialManager();
