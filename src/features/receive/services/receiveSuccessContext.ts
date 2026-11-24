/**
 * Recipient context shown on the receive success screen (wave item 83).
 *
 * The success screen used to show only the amount and asset, so a receiver
 * with more than one wallet (or a shared demo device) had no way to tell which
 * account the payment landed in. This module turns the orchestrator's
 * completed `PaymentRequest` into a display-ready summary: the receiving
 * account, the network it was requested on, and the optional memo / request
 * reference the payer saw.
 *
 * Everything here is already public — it is the same data the receiver
 * broadcast over NFC. No secrets, signed payloads or session tokens pass
 * through this function.
 *
 * @see docs/receive-flow.md — section 6, "Success screen context"
 */
import { StrKey } from '@stellar/stellar-sdk';

import type { PaymentRequest } from '@/features/nfc/schemas/paymentRequest';
import type { AppEnv } from '@/lib/env';

export interface ReceiveSuccessContext {
  amount: string;
  asset: string;
  /** Full receiving account, or null if the request carried an invalid key. */
  recipient: string | null;
  /** Shortened receiving account for compact display. */
  recipientShort: string | null;
  networkLabel: string;
  memo: string | null;
  requestId: string | null;
  txHash: string | null;
  txHashShort: string | null;
}

const NETWORK_LABELS: Record<AppEnv['stellarNetwork'], string> = {
  testnet: 'Stellar Testnet',
  mainnet: 'Stellar Mainnet',
};

/**
 * Keeps the first and last `edge` characters of a long identifier, e.g.
 * `GBBD47…LLFLA5`. Values short enough to read in full are returned as-is.
 */
export function truncateMiddle(value: string, edge = 6): string {
  if (value.length <= edge * 2) {
    return value;
  }
  return `${value.slice(0, edge)}…${value.slice(-edge)}`;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Builds the success-screen summary for a completed receive session.
 *
 * Returns null when there is no request to describe (for example, the
 * orchestrator was reset or the route was opened directly), so the view can
 * render an explicit fallback instead of an empty card.
 */
export function buildReceiveSuccessContext(
  paymentRequest: PaymentRequest | null,
  txHash: string | null,
  network: AppEnv['stellarNetwork']
): ReceiveSuccessContext | null {
  if (!paymentRequest) {
    return null;
  }

  // The request is schema-validated when built, but this screen asserts
  // "you were paid at this address", so re-check the checksum rather than
  // display a malformed key as if it were trustworthy.
  const recipient = StrKey.isValidEd25519PublicKey(paymentRequest.recipient)
    ? paymentRequest.recipient
    : null;
  const confirmedHash = nonEmpty(txHash);

  return {
    amount: paymentRequest.amount,
    asset: paymentRequest.asset,
    recipient,
    recipientShort: recipient ? truncateMiddle(recipient) : null,
    networkLabel: NETWORK_LABELS[network],
    memo: nonEmpty(paymentRequest.memo),
    requestId: nonEmpty(paymentRequest.requestId),
    txHash: confirmedHash,
    txHashShort: confirmedHash ? truncateMiddle(confirmedHash) : null,
  };
}
