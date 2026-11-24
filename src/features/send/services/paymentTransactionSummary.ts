import { FeeBumpTransaction, Networks, TransactionBuilder } from '@stellar/stellar-sdk';

import { ensureStellarPolyfills } from '@/features/wallet/services/stellarPolyfills';

ensureStellarPolyfills();

const STROOPS_PER_XLM_DIGITS = 7;

export type SummaryMemo =
  | { type: 'none' }
  | { type: 'text'; value: string }
  | { type: 'id'; value: string }
  | { type: 'hash' | 'return'; value: string };

/**
 * What the payer is about to sign, decoded from the unsigned envelope itself.
 *
 * Every field comes from the XDR returned by the server, never from the NFC
 * request, so the confirmation screen reflects the bytes that get signed.
 */
export interface PaymentTransactionSummary {
  network: 'TESTNET' | 'MAINNET';
  /** Hex transaction hash for the configured network passphrase. */
  hash: string;
  source: string;
  destination: string;
  asset: { code: string; issuer: string | null };
  amount: string;
  memo: SummaryMemo;
  /** Maximum total fee the payer authorizes, in stroops. */
  maxFeeStroops: string;
  /** Same fee expressed in XLM without floating point rounding. */
  maxFeeXlm: string;
  sequence: string;
  /** Upper time bound of the transaction, or null when it never expires. */
  expiresAt: Date | null;
}

interface DecodedPaymentOperation {
  type?: string;
  destination?: string;
  amount?: string;
  asset?: { isNative(): boolean; getCode(): string; getIssuer(): string };
}

interface DecodedTransaction {
  source: string;
  fee: string;
  sequence: string;
  timeBounds?: { minTime: string; maxTime: string };
  memo: { type: string; value: unknown };
  operations: DecodedPaymentOperation[];
  hash(): { toString(encoding: 'hex'): string };
}

/** Converts an integer stroop amount to an exact decimal XLM string. */
export function stroopsToXlm(stroops: string): string {
  if (!/^\d+$/.test(stroops)) {
    throw new Error('Transaction fee is not a valid stroop amount.');
  }

  const padded = stroops.padStart(STROOPS_PER_XLM_DIGITS + 1, '0');
  const whole = padded.slice(0, -STROOPS_PER_XLM_DIGITS).replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(-STROOPS_PER_XLM_DIGITS).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function networkFromPassphrase(passphrase: string): PaymentTransactionSummary['network'] {
  if (passphrase === Networks.TESTNET) return 'TESTNET';
  if (passphrase === Networks.PUBLIC) return 'MAINNET';
  throw new Error('Unsupported Stellar network passphrase.');
}

function bytesToHex(value: unknown): string {
  if (!(value instanceof Uint8Array)) {
    throw new Error('Payment transaction memo could not be decoded.');
  }
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toSummaryMemo(memo: DecodedTransaction['memo']): SummaryMemo {
  switch (memo.type) {
    case 'none':
      return { type: 'none' };
    case 'text':
    case 'id':
      return { type: memo.type, value: String(memo.value) };
    case 'hash':
    case 'return':
      // Hash-style memos decode to raw bytes; hex keeps them readable and unambiguous.
      return { type: memo.type, value: bytesToHex(memo.value) };
    default:
      throw new Error('Payment transaction has an unsupported memo type.');
  }
}

function toExpiry(timeBounds: DecodedTransaction['timeBounds']): Date | null {
  // A missing bound or a maxTime of 0 means the envelope is valid indefinitely.
  if (!timeBounds || timeBounds.maxTime === '0') return null;
  const seconds = Number(timeBounds.maxTime);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new Error('Payment transaction has an invalid expiry.');
  }
  return new Date(seconds * 1000);
}

/**
 * Decodes an unsigned single-payment envelope into a human-reviewable summary.
 *
 * This does not replace `AccountService.validatePaymentTransaction`; it only
 * rejects shapes that cannot be summarized honestly (fee bumps, multi-op or
 * non-payment transactions). Run the intent validation first.
 */
export function buildPaymentTransactionSummary(
  unsignedXdr: string,
  networkPassphrase: string
): PaymentTransactionSummary {
  if (!unsignedXdr) {
    throw new Error('Payment intent is missing its unsigned transaction.');
  }

  const network = networkFromPassphrase(networkPassphrase);
  const parsed = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase);
  // FeeBumpTransaction proxies `operations` from its inner transaction, so an
  // `'operations' in parsed` check is not enough to tell the two apart.
  if (parsed instanceof FeeBumpTransaction) {
    throw new Error('Fee-bump payment envelopes are not supported.');
  }

  const transaction = parsed as unknown as DecodedTransaction;
  if (transaction.operations.length !== 1) {
    throw new Error('Payment transaction must contain exactly one operation.');
  }

  const [operation] = transaction.operations;
  if (
    operation.type !== 'payment' ||
    !operation.destination ||
    !operation.amount ||
    !operation.asset
  ) {
    throw new Error('Payment transaction does not contain a payment operation.');
  }

  const isNative = operation.asset.isNative();
  return {
    network,
    hash: transaction.hash().toString('hex'),
    source: transaction.source,
    destination: operation.destination,
    asset: {
      code: isNative ? 'XLM' : operation.asset.getCode(),
      issuer: isNative ? null : operation.asset.getIssuer(),
    },
    amount: operation.amount,
    memo: toSummaryMemo(transaction.memo),
    maxFeeStroops: transaction.fee,
    maxFeeXlm: stroopsToXlm(transaction.fee),
    sequence: transaction.sequence,
    expiresAt: toExpiry(transaction.timeBounds),
  };
}

/** True once the envelope's upper time bound has passed; Stellar would reject it. */
export function isPaymentSummaryExpired(
  summary: Pick<PaymentTransactionSummary, 'expiresAt'>,
  now: number = Date.now()
): boolean {
  return summary.expiresAt !== null && summary.expiresAt.getTime() <= now;
}

/**
 * Guards the gap between review and signing: the envelope about to be signed
 * must be the exact one the payer reviewed and must still be within its time bounds.
 */
export function assertSigningMatchesSummary(
  reviewed: PaymentTransactionSummary,
  unsignedXdr: string,
  networkPassphrase: string,
  now: number = Date.now()
): void {
  const current = buildPaymentTransactionSummary(unsignedXdr, networkPassphrase);
  if (current.hash !== reviewed.hash) {
    throw new Error('The transaction changed after review. Scan the request again.');
  }
  if (isPaymentSummaryExpired(current, now)) {
    throw new Error('This transaction expired before it was signed. Scan a new request.');
  }
}
