/**
 * Receive screen entry point into the History tab, with explicit loading,
 * empty and error states for the received-payment summary.
 *
 * @see docs/receive-flow.md
 */
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, LoadingSpinner } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  useReceiveHistorySummary,
  type ReceiveHistoryLinkState,
} from '@/features/receive/hooks/useReceiveHistorySummary';
import { useWallet } from '@/features/wallet/hooks/useWallet';

type SummaryProps = {
  state: Exclude<ReceiveHistoryLinkState, { status: 'unavailable' }>;
  onRetry: () => void;
};

const Summary = ({ state, onRetry }: SummaryProps) => {
  switch (state.status) {
    case 'loading':
      return (
        <View style={styles.loadingRow} accessibilityLiveRegion="polite">
          <LoadingSpinner size="small" style={styles.spinner} />
          <ThemedText type="small" themeColor="textSecondary">
            Checking Stellar for recent payments…
          </ThemedText>
        </View>
      );
    case 'error':
      return (
        <>
          <ThemedText type="small" themeColor="error" accessibilityLiveRegion="polite">
            Couldn’t load received payments. Check your connection and try again.
          </ThemedText>
          <Button label="Try Again" variant="secondary" onPress={onRetry} />
        </>
      );
    case 'empty':
      return (
        <ThemedText type="small" themeColor="textSecondary">
          No received payments in your recent Stellar activity yet. Payments appear here once they
          settle on the network.
        </ThemedText>
      );
    case 'ready':
      return (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {state.count === 1
              ? '1 received payment in recent activity'
              : `${state.count} received payments in recent activity`}
          </ThemedText>
          <ThemedText type="small" themeColor={state.latest.verifiedAsset ? 'text' : 'error'}>
            Latest: {state.latest.amount} {state.latest.asset} ·{' '}
            {new Date(state.latest.createdAt).toLocaleString()}
          </ThemedText>
        </>
      );
  }
};

export const ReceiveHistoryLink = () => {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { state, retry } = useReceiveHistorySummary(publicKey);

  // Without a wallet there is nothing to summarize; the receive form above
  // already explains why receiving is unavailable.
  if (state.status === 'unavailable') {
    return null;
  }

  return (
    <Card style={styles.card}>
      <ThemedText type="smallBold">Received payments</ThemedText>
      <Summary state={state} onRetry={retry} />
      <Button
        label="View History"
        variant="secondary"
        accessibilityHint="Opens the History tab with your settled Stellar payments"
        onPress={() => router.push('/(tabs)/history')}
      />
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  spinner: {
    padding: 0,
  },
});
