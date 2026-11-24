import { PaymentApiError } from '@/features/payments/services/PaymentApiClient';
import {
  ReceiveFailureCode,
  ReceiveFailureError,
  getReceiveFailureMessage,
  isReceiveFailureCode,
  toReceiveFailureCode,
} from '@/features/receive/services/receiveFailure';

describe('toReceiveFailureCode', () => {
  it.each(Object.values(ReceiveFailureCode))('passes the known code %s through', (code) => {
    expect(toReceiveFailureCode(code)).toBe(code);
  });

  it('uses the code carried by a ReceiveFailureError, not its developer detail', () => {
    const error = new ReceiveFailureError(
      ReceiveFailureCode.NETWORK_MISMATCH,
      'Server network mismatch: expected TESTNET.'
    );

    expect(error.message).toBe('Server network mismatch: expected TESTNET.');
    expect(toReceiveFailureCode(error)).toBe('network_mismatch');
  });

  it('defaults a ReceiveFailureError message to its code', () => {
    expect(new ReceiveFailureError(ReceiveFailureCode.TRUSTLINE_MISSING).message).toBe(
      'trustline_missing'
    );
  });

  it('maps any Vela API error to request_registration_failed regardless of its message', () => {
    const apiError = new PaymentApiError(
      'duplicate key value violates "payment_requests_pkey"',
      409
    );

    expect(toReceiveFailureCode(apiError)).toBe('request_registration_failed');
  });

  it('honours plain errors whose message is exactly a known code', () => {
    expect(toReceiveFailureCode(new Error('trustline_missing'))).toBe('trustline_missing');
  });

  it.each([
    ['free text', 'Payment request belongs to MAINNET, not TESTNET.'],
    ['a code with extra text', 'timeout: socket hang up'],
    ['a differently cased code', 'TIMEOUT'],
    ['an empty string', ''],
    ['an arbitrary error', new TypeError('Network request failed: http://10.0.0.5:3000/v1')],
    ['null', null],
    ['undefined', undefined],
    ['a number', 500],
    ['an object', { code: 'timeout' }],
  ])('collapses %s to unknown', (_label, input) => {
    expect(toReceiveFailureCode(input)).toBe('unknown');
  });
});

describe('isReceiveFailureCode', () => {
  it('accepts only the closed set of codes', () => {
    expect(isReceiveFailureCode('payment_failed')).toBe(true);
    expect(isReceiveFailureCode('payment failed')).toBe(false);
    expect(isReceiveFailureCode(undefined)).toBe(false);
  });
});

describe('getReceiveFailureMessage', () => {
  it('returns specific copy for each known code', () => {
    expect(getReceiveFailureMessage('timeout')).toBe('Payment timed out. Please try again.');
    expect(getReceiveFailureMessage('nfc_error')).toBe('NFC connection was lost.');
    expect(getReceiveFailureMessage('trustline_missing')).toBe(
      'USDC trustline not found. Set up your USDC account first.'
    );
    expect(getReceiveFailureMessage('network_mismatch')).toMatch(/Stellar network/);
    expect(getReceiveFailureMessage('request_registration_failed')).toMatch(/could not register/);
    expect(getReceiveFailureMessage('payment_failed')).toMatch(/could not be completed/);
  });

  it('has distinct, non-empty copy for every code', () => {
    const messages = Object.values(ReceiveFailureCode).map(getReceiveFailureMessage);

    messages.forEach((message) => expect(message.trim()).not.toBe(''));
    expect(new Set(messages).size).toBe(messages.length);
  });

  it('never echoes an unrecognised reason back to the user', () => {
    const leaky = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 request 42 failed';

    expect(getReceiveFailureMessage(leaky)).toBe('Payment failed. Please try again.');
  });

  it('falls back to the generic message when no reason is stored', () => {
    expect(getReceiveFailureMessage(null)).toBe('Payment failed. Please try again.');
    expect(getReceiveFailureMessage(undefined)).toBe('Payment failed. Please try again.');
  });
});
