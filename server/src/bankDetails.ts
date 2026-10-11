import { encryptBuffer, decryptBuffer } from './crewDocCrypto';

export interface BankDetails {
  accountName: string;
  sortCode: string;
  accountNumber: string;
  bankName?: string;
}

/** Structured bank details, encrypted at rest with the same AES-256-GCM scheme as crew
 * documents (see crewDocCrypto.ts) even though there's no file involved — the ciphertext is
 * just the JSON-stringified field set, base64-encoded so it fits a text column. */
export function encryptBankDetails(details: BankDetails): { ciphertext: string; iv: string; authTag: string } {
  const { ciphertext, iv, authTag } = encryptBuffer(Buffer.from(JSON.stringify(details)));
  return { ciphertext: ciphertext.toString('base64'), iv, authTag };
}

export function decryptBankDetails(ciphertextB64: string, iv: string, authTag: string): BankDetails {
  const plaintext = decryptBuffer(Buffer.from(ciphertextB64, 'base64'), iv, authTag);
  return JSON.parse(plaintext.toString('utf8')) as BankDetails;
}

/** Parses the bankDetails field every intake/edit route accepts (a JSON string, since it rides
 * alongside file uploads in a multipart body, or a plain object from a JSON body) into a
 * validated BankDetails, or null if none was provided. Throws a plain Error with a
 * client-safe message on invalid input — callers turn that into a 400. */
export function parseBankDetails(raw: unknown): BankDetails | null {
  if (raw === undefined || raw === null || raw === '') return null;
  let parsed: Partial<BankDetails>;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('bankDetails must be valid JSON');
    }
  } else if (typeof raw === 'object') {
    parsed = raw as Partial<BankDetails>;
  } else {
    throw new Error('bankDetails must be an object or a JSON string');
  }
  if (!parsed.accountName || !parsed.sortCode || !parsed.accountNumber) {
    throw new Error('bankDetails requires accountName, sortCode, and accountNumber');
  }
  return { accountName: parsed.accountName, sortCode: parsed.sortCode, accountNumber: parsed.accountNumber, bankName: parsed.bankName || undefined };
}
