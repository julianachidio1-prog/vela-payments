import type { PaymentRequest } from '@/features/nfc/schemas/paymentRequest';
import {
  buildReceiveSuccessContext,
  truncateMiddle,
} from '@/features/receive/services/receiveSuccessContext';

// Public testnet USDC issuer — a well-known address, not a wallet under test.
const RECIPIENT = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const TX_HASH = 'a'.repeat(64);

function request(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    type: 'payment_request',
    recipient: RECIPIENT,
    asset: 'XLM',
    amount: '12.5',
    timestamp: 1_000,
    expiresAt: 1_300,
    ...overrides,
  };
}

describe('truncateMiddle', () => {
  it('keeps both ends of a long identifier', () => {
    expect(truncateMiddle(RECIPIENT)).toBe('GBBD47…LLFLA5');
  });

  it('returns short values unchanged', () => {
    expect(truncateMiddle('abc123')).toBe('abc123');
    expect(truncateMiddle('123456789012')).toBe('123456789012');
  });
});

describe('buildReceiveSuccessContext', () => {
  it('describes the receiving account, network and confirmed transaction', () => {
    const context = buildReceiveSuccessContext(
      request({ memo: 'Table 4', requestId: 'req_01' }),
      TX_HASH,
      'testnet'
    );

    expect(context).toEqual({
      amount: '12.5',
      asset: 'XLM',
      recipient: RECIPIENT,
      recipientShort: 'GBBD47…LLFLA5',
      networkLabel: 'Stellar Testnet',
      memo: 'Table 4',
      requestId: 'req_01',
      txHash: TX_HASH,
      txHashShort: 'aaaaaa…aaaaaa',
    });
  });

  it('labels mainnet requests distinctly from testnet', () => {
    expect(buildReceiveSuccessContext(request(), null, 'mainnet')?.networkLabel).toBe(
      'Stellar Mainnet'
    );
  });

  it('omits optional fields that are absent or blank', () => {
    const context = buildReceiveSuccessContext(request({ memo: '   ' }), '', 'testnet');

    expect(context?.memo).toBeNull();
    expect(context?.requestId).toBeNull();
    expect(context?.txHash).toBeNull();
    expect(context?.txHashShort).toBeNull();
  });

  it('returns null when there is no completed request to describe', () => {
    expect(buildReceiveSuccessContext(null, TX_HASH, 'testnet')).toBeNull();
  });

  it('refuses to present a recipient that fails the StrKey checksum', () => {
    // Same shape as a real key, but the last character breaks the checksum.
    const corrupted = `${RECIPIENT.slice(0, -1)}A`;
    const context = buildReceiveSuccessContext(request({ recipient: corrupted }), null, 'testnet');

    expect(context?.recipient).toBeNull();
    expect(context?.recipientShort).toBeNull();
    // The rest of the summary is still usable.
    expect(context?.amount).toBe('12.5');
  });
});
