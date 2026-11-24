/**
 * Receive success screen (CLI-067).
 *
 * RECEIVE_COMPLETED is emitted by the orchestrator's confirmSuccess() at the
 * moment of the state transition — this view only renders the result, it
 * does not re-emit the event (that would double-count the funnel step).
 *
 * Alongside the amount, the screen shows the recipient context of the
 * completed request (receiving account, network, memo, request reference) so
 * the receiver can confirm where the payment landed.
 *
 * @see docs/receive-flow.md
 */
import { useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useReceivePaymentContext } from '@/features/receive/hooks/useReceivePayment';
import {
  buildReceiveSuccessContext,
  type ReceiveSuccessContext,
} from '@/features/receive/services/receiveSuccessContext';
import { env } from '@/lib/env';
import { stellarTransactionUrl } from '@/lib/stellarExplorer';

/**
 * Holds on to the last non-null success context for the lifetime of this
 * screen. "Receive Another" resets the shared orchestrator before the router
 * has replaced this screen, and without the latch the summary would blank
 * out (and the explorer button disappear) for the frames in between.
 */
function useRetainedSuccessContext(live: ReceiveSuccessContext | null) {
  const [retained, setRetained] = useState(live);
  if (live !== null && live !== retained) {
    setRetained(live);
  }
  return live ?? retained;
}

interface DetailRowProps {
  label: string;
  value: string;
  accessibilityValue?: string;
  monospace?: boolean;
}

const DetailRow = ({ label, value, accessibilityValue, monospace }: DetailRowProps) => (
  <View
    style={styles.detailRow}
    accessible
    accessibilityLabel={`${label}: ${accessibilityValue ?? value}`}
  >
    <ThemedText type="small" themeColor="textSecondary">
      {label}
    </ThemedText>
    <ThemedText type={monospace ? 'code' : 'smallBold'} selectable style={styles.detailValue}>
      {value}
    </ThemedText>
  </View>
);

export const ReceiveSuccessView = () => {
  const router = useRouter();
  const { paymentRequest, txHash, reset } = useReceivePaymentContext();

  const liveContext = useMemo(
    () => buildReceiveSuccessContext(paymentRequest, txHash, env.stellarNetwork),
    [paymentRequest, txHash]
  );
  const context = useRetainedSuccessContext(liveContext);
  const confirmedHash = context?.txHash ?? null;

  const handleReceiveAnother = () => {
    reset();
    router.replace('/(tabs)/receive');
  };

  const handleDone = () => {
    router.replace('/(tabs)/receive');
  };

  return (
    <Screen>
      <View style={styles.body}>
        <ThemedText type="title">✓</ThemedText>
        <ThemedText type="subtitle">Payment received</ThemedText>
        {context ? (
          <>
            <ThemedText themeColor="textSecondary">
              {context.amount} {context.asset}
            </ThemedText>
            <Card style={styles.details}>
              {context.recipient && context.recipientShort ? (
                <DetailRow
                  label="To"
                  value={context.recipientShort}
                  accessibilityValue={context.recipient}
                  monospace
                />
              ) : null}
              <DetailRow label="Network" value={context.networkLabel} />
              {context.memo ? <DetailRow label="Memo" value={context.memo} /> : null}
              {context.requestId ? (
                <DetailRow label="Request" value={context.requestId} monospace />
              ) : null}
              {context.txHash && context.txHashShort ? (
                <DetailRow
                  label="Transaction"
                  value={context.txHashShort}
                  accessibilityValue={context.txHash}
                  monospace
                />
              ) : null}
            </Card>
          </>
        ) : (
          <ThemedText themeColor="textSecondary" style={styles.fallback}>
            Payment details are no longer available on this device.
          </ThemedText>
        )}
      </View>

      <View style={styles.actions}>
        {confirmedHash ? (
          <Button
            label="View on Stellar Expert"
            variant="secondary"
            onPress={() => void Linking.openURL(stellarTransactionUrl(confirmedHash))}
          />
        ) : null}
        <Button label="Receive Another" onPress={handleReceiveAnother} />
        <Button label="Done" variant="secondary" onPress={handleDone} />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  details: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  fallback: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
});
