import { createElement } from 'react';
import { Linking } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { Button } from '@/components/ui';
import type { PaymentRequest } from '@/features/nfc/schemas/paymentRequest';
import type { UseReceivePaymentResult } from '@/features/receive/hooks/useReceivePayment';
import { ReceiveSuccessView } from '@/features/receive/views/ReceiveSuccessView';

const RECIPIENT = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const TX_HASH = 'b'.repeat(64);

const COMPLETED_REQUEST: PaymentRequest = {
  type: 'payment_request',
  recipient: RECIPIENT,
  asset: 'USDC',
  amount: '7',
  timestamp: 1_000,
  expiresAt: 1_300,
  memo: 'Coffee',
  requestId: 'req_42',
};

// ─── Mocks ──────────────────────────────────────────────────────────────────

// theme.ts imports the web stylesheet, which Jest cannot parse.
jest.mock('@/global.css', () => ({}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// The view only needs the safe-area container to render its children.
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const mockReset = jest.fn();
let mockContext: Pick<UseReceivePaymentResult, 'paymentRequest' | 'txHash' | 'reset'>;
jest.mock('@/features/receive/hooks/useReceivePayment', () => ({
  useReceivePaymentContext: () => mockContext,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function render(): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(ReceiveSuccessView));
  });
  return renderer;
}

function textContent(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => [node.props.children].flat().join(''));
}

function findButton(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  return renderer.root.find((node) => node.type === Button && node.props.label === label);
}

describe('ReceiveSuccessView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContext = { paymentRequest: COMPLETED_REQUEST, txHash: TX_HASH, reset: mockReset };
  });

  it('shows where the payment was received alongside the amount', () => {
    const renderer = render();
    const text = textContent(renderer);

    expect(text).toEqual(
      expect.arrayContaining([
        'Payment received',
        '7 USDC',
        'GBBD47…LLFLA5',
        'Stellar Testnet',
        'Coffee',
        'req_42',
        'bbbbbb…bbbbbb',
      ])
    );

    // Screen readers get the full account, not the truncated form.
    expect(
      renderer.root.findAll((node) => node.props.accessibilityLabel === `To: ${RECIPIENT}`)
    ).not.toHaveLength(0);

    // Nothing secret is ever available to this view, but make sure the full
    // public key isn't dumped into visible text either.
    expect(text).not.toContain(RECIPIENT);
  });

  it('keeps recipient context on screen while "Receive Another" resets the session', () => {
    const renderer = render();

    act(() => {
      findButton(renderer, 'Receive Another').props.onPress();
    });
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/receive');

    // Simulate the orchestrator clearing its state before navigation unmounts us.
    mockContext = { paymentRequest: null, txHash: null, reset: mockReset };
    act(() => {
      renderer.update(createElement(ReceiveSuccessView));
    });

    const text = textContent(renderer);
    expect(text).toEqual(expect.arrayContaining(['7 USDC', 'GBBD47…LLFLA5']));
    expect(text).not.toContain('Payment details are no longer available on this device.');
  });

  it('opens the explorer for the retained transaction hash', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const renderer = render();

    act(() => {
      findButton(renderer, 'View on Stellar Expert').props.onPress();
    });

    expect(openURL).toHaveBeenCalledWith(`https://stellar.expert/explorer/testnet/tx/${TX_HASH}`);
    openURL.mockRestore();
  });

  it('falls back to an explicit message when no completed request exists', () => {
    mockContext = { paymentRequest: null, txHash: null, reset: mockReset };
    const renderer = render();
    const text = textContent(renderer);

    expect(text).toContain('Payment details are no longer available on this device.');
    expect(text).not.toContain('Stellar Testnet');
    expect(
      renderer.root.findAll(
        (node) => node.type === Button && node.props.label === 'View on Stellar Expert'
      )
    ).toHaveLength(0);
  });

  it('hides the recipient row rather than show an invalid account', () => {
    mockContext = {
      paymentRequest: { ...COMPLETED_REQUEST, recipient: `${RECIPIENT.slice(0, -1)}A` },
      txHash: null,
      reset: mockReset,
    };
    const renderer = render();
    const text = textContent(renderer);

    expect(text).not.toContain('To');
    expect(text).toEqual(expect.arrayContaining(['7 USDC', 'Stellar Testnet']));
  });
});
