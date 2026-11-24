/**
 * Receive failure screen (CLI-068).
 *
 * @see docs/receive-flow.md — error matrix
 */
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useReceivePaymentContext } from '@/features/receive/hooks/useReceivePayment';
import { getReceiveFailureMessage } from '@/features/receive/services/receiveFailure';

export const ReceiveFailedView = () => {
  const router = useRouter();
  const { error, paymentRequest, reset } = useReceivePaymentContext();

  // Only fixed copy is rendered; the stored reason is never displayed as-is.
  const message = getReceiveFailureMessage(error);

  const handleTryAgain = () => {
    const amount = paymentRequest?.amount;
    const asset = paymentRequest?.asset;
    reset();
    router.replace({
      pathname: '/(tabs)/receive',
      params: amount && asset ? { amount, asset } : undefined,
    });
  };

  const handleChangeAmount = () => {
    reset();
    router.replace('/(tabs)/receive');
  };

  return (
    <Screen>
      <View style={styles.body}>
        <ThemedText type="title" themeColor="error">
          ✕
        </ThemedText>
        <ThemedText type="subtitle">Payment failed</ThemedText>
        <ThemedText themeColor="textSecondary">{message}</ThemedText>
      </View>

      <View style={styles.actions}>
        <Button label="Try Again" onPress={handleTryAgain} />
        <Button label="Change Amount" variant="secondary" onPress={handleChangeAmount} />
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
  actions: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
});
