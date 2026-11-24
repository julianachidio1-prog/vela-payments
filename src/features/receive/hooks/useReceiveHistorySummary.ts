/**
 * Summary of recently received payments for the receive screen's history link.
 *
 * The data comes from the same Horizon-backed `HistoryService` the History tab
 * uses, so the link never claims more than Stellar has actually settled.
 * Horizon only returns the latest page of payment operations (sent and
 * received), so the count is "received payments in recent activity", not an
 * all-time total.
 *
 * @see docs/receive-flow.md
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { HistoryService, type HistoryItem } from '@/features/history/services/HistoryService';

export type ReceiveHistoryLinkState =
  /** No wallet yet, so there is no account to look up. */
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; count: number; latest: HistoryItem };

/** Result of the last completed history lookup, tagged with the account it belongs to. */
export type ReceiveHistorySnapshot =
  | { publicKey: string; outcome: 'loaded'; items: readonly HistoryItem[] }
  | { publicKey: string; outcome: 'failed' };

/**
 * Maps the active wallet and the last lookup result to a renderable state.
 *
 * A snapshot recorded for a different account is treated as "still loading"
 * so a wallet switch never shows the previous wallet's payments.
 */
export function deriveReceiveHistoryLinkState(
  publicKey: string | null,
  snapshot: ReceiveHistorySnapshot | null
): ReceiveHistoryLinkState {
  if (!publicKey) {
    return { status: 'unavailable' };
  }
  if (!snapshot || snapshot.publicKey !== publicKey) {
    return { status: 'loading' };
  }
  if (snapshot.outcome === 'failed') {
    return { status: 'error' };
  }

  // HistoryService returns newest first, so the first match is the latest receive.
  const received = snapshot.items.filter((item) => item.direction === 'received');
  const [latest] = received;
  if (!latest) {
    return { status: 'empty' };
  }
  return { status: 'ready', count: received.length, latest };
}

export interface UseReceiveHistorySummaryResult {
  state: ReceiveHistoryLinkState;
  /** Clears the current result and fetches again; used by the error state's retry action. */
  retry: () => void;
}

/**
 * Loads the received-payment summary whenever the receive screen gains focus,
 * so returning from a completed receive flow picks up the new payment.
 *
 * Refreshes on focus keep the previous summary visible instead of flashing
 * the loading state; only the first load and explicit retries show it.
 */
export function useReceiveHistorySummary(publicKey: string | null): UseReceiveHistorySummaryResult {
  const [snapshot, setSnapshot] = useState<ReceiveHistorySnapshot | null>(null);
  // Monotonic request id: only the most recent lookup may write state, which
  // drops responses that arrive after a wallet switch, blur or unmount.
  const latestRequest = useRef(0);

  const load = useCallback((accountId: string) => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;

    HistoryService.list(accountId).then(
      (items) => {
        if (requestId === latestRequest.current) {
          setSnapshot({ publicKey: accountId, outcome: 'loaded', items });
        }
      },
      () => {
        // The UI surfaces this as the error state. The underlying error is not
        // logged because Horizon errors can echo the account id back.
        if (requestId === latestRequest.current) {
          setSnapshot({ publicKey: accountId, outcome: 'failed' });
        }
      }
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!publicKey) {
        return undefined;
      }
      load(publicKey);
      return () => {
        latestRequest.current += 1;
      };
    }, [publicKey, load])
  );

  const retry = useCallback(() => {
    if (!publicKey) {
      return;
    }
    setSnapshot(null);
    load(publicKey);
  }, [publicKey, load]);

  return { state: deriveReceiveHistoryLinkState(publicKey, snapshot), retry };
}
