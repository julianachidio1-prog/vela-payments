/**
 * User-safe failure reasons for the receive flow.
 *
 * Failures can originate from the NFC writer, Horizon (trustline check), the
 * Vela API or the receive timers. Their raw messages may contain server
 * internals, request IDs, URLs or network details, so they never reach the
 * failure screen or analytics directly. Every failure is collapsed into one of
 * the closed `ReceiveFailureCode` values below, and only the matching English
 * message is rendered.
 *
 * @see docs/receive-flow.md — error matrix
 */
import { PaymentApiError } from '@/features/payments/services/PaymentApiClient';

export const ReceiveFailureCode = {
  /** No payment confirmation arrived before the wait timeout. */
  TIMEOUT: 'timeout',
  /** The NFC writer session errored before the request reached the payer. */
  NFC_ERROR: 'nfc_error',
  /** A USDC request was attempted without a USDC trustline on the receiver. */
  TRUSTLINE_MISSING: 'trustline_missing',
  /** The server reported a Stellar network other than the one the app is built for. */
  NETWORK_MISMATCH: 'network_mismatch',
  /** The Vela API rejected or could not store the payment request. */
  REQUEST_REGISTRATION_FAILED: 'request_registration_failed',
  /** The server reported the payer's Stellar payment as failed. */
  PAYMENT_FAILED: 'payment_failed',
  /** Anything else. Deliberately generic. */
  UNKNOWN: 'unknown',
} as const;

export type ReceiveFailureCodeValue = (typeof ReceiveFailureCode)[keyof typeof ReceiveFailureCode];

const RECEIVE_FAILURE_MESSAGES: Record<ReceiveFailureCodeValue, string> = {
  timeout: 'Payment timed out. Please try again.',
  nfc_error: 'NFC connection was lost.',
  trustline_missing: 'USDC trustline not found. Set up your USDC account first.',
  network_mismatch:
    'This request does not match the Stellar network Vela is using. Start a new request.',
  request_registration_failed:
    'Vela could not register this payment request. Check your connection and try again.',
  payment_failed: 'The payment could not be completed on Stellar. Ask the payer to try again.',
  unknown: 'Payment failed. Please try again.',
};

const KNOWN_CODES = new Set<string>(Object.values(ReceiveFailureCode));

/** Narrows an arbitrary string to a known failure code. */
export function isReceiveFailureCode(value: unknown): value is ReceiveFailureCodeValue {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

/**
 * Error thrown inside the receive flow when the failure category is already
 * known. `message` is developer-facing detail and is never shown to users;
 * `code` is what the UI and analytics consume.
 */
export class ReceiveFailureError extends Error {
  constructor(
    readonly code: ReceiveFailureCodeValue,
    detail?: string
  ) {
    super(detail ?? code);
    this.name = 'ReceiveFailureError';
  }
}

/**
 * Collapses any failure input (a code, a thrown error, free text from a
 * caller) into a `ReceiveFailureCode`. Unrecognised input becomes `unknown`
 * rather than being passed through, so new failure sources stay safe by
 * default until they are explicitly mapped here.
 */
export function toReceiveFailureCode(reason: unknown): ReceiveFailureCodeValue {
  if (isReceiveFailureCode(reason)) {
    return reason;
  }
  if (reason instanceof ReceiveFailureError) {
    return reason.code;
  }
  if (reason instanceof PaymentApiError) {
    return ReceiveFailureCode.REQUEST_REGISTRATION_FAILED;
  }
  // Older call sites throw `new Error('<code>')`; honour those, nothing else.
  if (reason instanceof Error && isReceiveFailureCode(reason.message)) {
    return reason.message;
  }
  return ReceiveFailureCode.UNKNOWN;
}

/** Returns the end-user message for a stored failure reason. Never echoes its input. */
export function getReceiveFailureMessage(reason: string | null | undefined): string {
  return RECEIVE_FAILURE_MESSAGES[toReceiveFailureCode(reason)];
}
