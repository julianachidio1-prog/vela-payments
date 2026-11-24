import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import type { HistoryItem } from '@/features/history/services/HistoryService';
import { ReceiveHistoryLink } from '@/features/receive/components/ReceiveHistoryLink';

const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const RECEIVED: HistoryItem = {
  id: 'op-1',
  hash: 'hash-1',
  createdAt: '2026-11-07T12:00:00Z',
  direction: 'received',
  asset: 'USDC',
  assetIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  verifiedAsset: true,
  amount: '+2.5000000',
  counterparty: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  ledger: 123,
  explorerUrl: 'https://stellar.expert/explorer/testnet/tx/hash-1',
};

// ─── Mocks ──────────────────────────────────────────────────────────────────

// The theme module imports the web stylesheet, which Jest cannot parse.
jest.mock('@/global.css', () => ({}));

let mockPublicKey: string | null = WALLET;
jest.mock('@/features/wallet/hooks/useWallet', () => ({
  useWallet: () => ({ publicKey: mockPublicKey }),
}));

const mockList = jest.fn<Promise<HistoryItem[]>, [string]>();
jest.mock('@/features/history/services/HistoryService', () => ({
  HistoryService: { list: (publicKey: string) => mockList(publicKey) },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function render(): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ReceiveHistoryLink />);
  });
  return renderer;
}

/** Flattens every rendered string so assertions don't depend on Text nesting. */
function renderedText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const visit = (node: ReturnType<ReactTestRenderer['toJSON']> | string) => {
    if (node === null) return;
    if (typeof node === 'string') {
      parts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    node.children?.forEach(visit);
  };
  visit(renderer.toJSON());
  return parts.join('');
}

function buttonWithLabel(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  return renderer.root.find(
    (node) => node.props.label === label && typeof node.props.onPress === 'function'
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ReceiveHistoryLink', () => {
  beforeEach(() => {
    mockPublicKey = WALLET;
    mockList.mockReset();
    mockPush.mockReset();
  });

  it('renders nothing before a wallet exists', () => {
    mockPublicKey = null;

    const renderer = render();

    expect(renderer.toJSON()).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });

  it('shows a loading state while history is being fetched', () => {
    mockList.mockReturnValueOnce(new Promise<HistoryItem[]>(() => {}));

    const renderer = render();

    expect(renderedText(renderer)).toContain('Checking Stellar for recent payments');
    expect(
      renderer.root.findAll((node) => node.props.accessibilityRole === 'progressbar')
    ).not.toHaveLength(0);
  });

  it('shows an empty state when nothing has been received', async () => {
    mockList.mockResolvedValueOnce([]);

    const renderer = render();
    await act(async () => {});

    const text = renderedText(renderer);
    expect(text).toContain('No received payments in your recent Stellar activity yet');
    expect(text).not.toContain('Checking Stellar');
  });

  it('summarizes received payments and links to the History tab', async () => {
    mockList.mockResolvedValueOnce([RECEIVED]);

    const renderer = render();
    await act(async () => {});

    const text = renderedText(renderer);
    expect(text).toContain('1 received payment in recent activity');
    expect(text).toContain('Latest: +2.5000000 USDC');

    act(() => {
      buttonWithLabel(renderer, 'View History').props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/history');
  });

  it('shows an error with a working retry when Horizon is unreachable', async () => {
    mockList.mockRejectedValueOnce(new Error('Network request failed'));

    const renderer = render();
    await act(async () => {});
    expect(renderedText(renderer)).toContain('Couldn’t load received payments');

    mockList.mockResolvedValueOnce([RECEIVED]);
    await act(async () => {
      buttonWithLabel(renderer, 'Try Again').props.onPress();
    });

    expect(mockList).toHaveBeenCalledTimes(2);
    expect(renderedText(renderer)).toContain('1 received payment in recent activity');
  });
});
