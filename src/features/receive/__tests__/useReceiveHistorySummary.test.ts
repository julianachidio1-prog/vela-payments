import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { HistoryItem } from '@/features/history/services/HistoryService';
import {
  deriveReceiveHistoryLinkState,
  useReceiveHistorySummary,
  type UseReceiveHistorySummaryResult,
} from '@/features/receive/hooks/useReceiveHistorySummary';

const WALLET_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const WALLET_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

function historyItem(overrides: Partial<HistoryItem>): HistoryItem {
  return {
    id: 'op-1',
    hash: 'hash-1',
    createdAt: '2026-11-07T12:00:00Z',
    direction: 'received',
    asset: 'XLM',
    assetIssuer: null,
    verifiedAsset: true,
    amount: '+5.0000000',
    counterparty: WALLET_B,
    ledger: 123,
    explorerUrl: 'https://stellar.expert/explorer/testnet/tx/hash-1',
    ...overrides,
  };
}

const SENT = historyItem({ id: 'op-sent', direction: 'sent', amount: '-1.0000000' });
const RECEIVED_NEWEST = historyItem({ id: 'op-new', amount: '+7.0000000' });
const RECEIVED_OLDER = historyItem({ id: 'op-old', amount: '+2.0000000' });

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockList = jest.fn<Promise<HistoryItem[]>, [string]>();
jest.mock('@/features/history/services/HistoryService', () => ({
  HistoryService: { list: (publicKey: string) => mockList(publicKey) },
}));

// Outside a navigator, treat "focused" as "mounted" so the effect runs once
// per callback identity, exactly like useFocusEffect on a focused screen.
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderSummary(initialPublicKey: string | null) {
  const result: { current: UseReceiveHistorySummaryResult } = {
    current: undefined as unknown as UseReceiveHistorySummaryResult,
  };

  function TestComponent({ publicKey }: { publicKey: string | null }) {
    result.current = useReceiveHistorySummary(publicKey);
    return null;
  }

  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(TestComponent, { publicKey: initialPublicKey }));
  });

  return {
    result,
    rerender: (publicKey: string | null) =>
      act(() => renderer.update(createElement(TestComponent, { publicKey }))),
  };
}

// ─── deriveReceiveHistoryLinkState ──────────────────────────────────────────

describe('deriveReceiveHistoryLinkState', () => {
  it('is unavailable without a wallet', () => {
    expect(deriveReceiveHistoryLinkState(null, null)).toEqual({ status: 'unavailable' });
  });

  it('is loading until the first lookup for the wallet completes', () => {
    expect(deriveReceiveHistoryLinkState(WALLET_A, null)).toEqual({ status: 'loading' });
  });

  it('does not show a snapshot that belongs to a different wallet', () => {
    expect(
      deriveReceiveHistoryLinkState(WALLET_A, {
        publicKey: WALLET_B,
        outcome: 'loaded',
        items: [RECEIVED_NEWEST],
      })
    ).toEqual({ status: 'loading' });
  });

  it('reports a failed lookup as an error', () => {
    expect(
      deriveReceiveHistoryLinkState(WALLET_A, { publicKey: WALLET_A, outcome: 'failed' })
    ).toEqual({ status: 'error' });
  });

  it('is empty when there are no payments at all', () => {
    expect(
      deriveReceiveHistoryLinkState(WALLET_A, { publicKey: WALLET_A, outcome: 'loaded', items: [] })
    ).toEqual({ status: 'empty' });
  });

  it('is empty when recent activity only contains sent payments', () => {
    expect(
      deriveReceiveHistoryLinkState(WALLET_A, {
        publicKey: WALLET_A,
        outcome: 'loaded',
        items: [SENT],
      })
    ).toEqual({ status: 'empty' });
  });

  it('counts received payments and picks the newest one', () => {
    expect(
      deriveReceiveHistoryLinkState(WALLET_A, {
        publicKey: WALLET_A,
        outcome: 'loaded',
        items: [SENT, RECEIVED_NEWEST, RECEIVED_OLDER],
      })
    ).toEqual({ status: 'ready', count: 2, latest: RECEIVED_NEWEST });
  });
});

// ─── useReceiveHistorySummary ───────────────────────────────────────────────

describe('useReceiveHistorySummary', () => {
  beforeEach(() => {
    mockList.mockReset();
  });

  it('does not query Horizon without a wallet', () => {
    const { result } = renderSummary(null);

    expect(result.current.state).toEqual({ status: 'unavailable' });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('moves from loading to ready once history resolves', async () => {
    const request = deferred<HistoryItem[]>();
    mockList.mockReturnValueOnce(request.promise);

    const { result } = renderSummary(WALLET_A);
    expect(result.current.state).toEqual({ status: 'loading' });
    expect(mockList).toHaveBeenCalledWith(WALLET_A);

    await act(async () => {
      request.resolve([RECEIVED_NEWEST, SENT]);
    });

    expect(result.current.state).toEqual({ status: 'ready', count: 1, latest: RECEIVED_NEWEST });
  });

  it('moves from loading to empty when the wallet has not received anything', async () => {
    mockList.mockResolvedValueOnce([SENT]);

    const { result } = renderSummary(WALLET_A);
    await act(async () => {});

    expect(result.current.state).toEqual({ status: 'empty' });
  });

  it('surfaces a Horizon failure and recovers through retry', async () => {
    mockList.mockRejectedValueOnce(new Error('Horizon unavailable'));

    const { result } = renderSummary(WALLET_A);
    await act(async () => {});
    expect(result.current.state).toEqual({ status: 'error' });

    const retryRequest = deferred<HistoryItem[]>();
    mockList.mockReturnValueOnce(retryRequest.promise);

    act(() => {
      result.current.retry();
    });
    expect(result.current.state).toEqual({ status: 'loading' });

    await act(async () => {
      retryRequest.resolve([RECEIVED_NEWEST]);
    });
    expect(result.current.state).toEqual({ status: 'ready', count: 1, latest: RECEIVED_NEWEST });
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('ignores a late response for a wallet that is no longer active', async () => {
    const staleRequest = deferred<HistoryItem[]>();
    const currentRequest = deferred<HistoryItem[]>();
    mockList.mockReturnValueOnce(staleRequest.promise).mockReturnValueOnce(currentRequest.promise);

    const { result, rerender } = renderSummary(WALLET_A);
    rerender(WALLET_B);
    expect(mockList).toHaveBeenLastCalledWith(WALLET_B);

    await act(async () => {
      staleRequest.resolve([RECEIVED_NEWEST]);
    });
    expect(result.current.state).toEqual({ status: 'loading' });

    await act(async () => {
      currentRequest.resolve([]);
    });
    expect(result.current.state).toEqual({ status: 'empty' });
  });
});
