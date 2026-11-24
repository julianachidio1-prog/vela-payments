import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type {
  PaymentTransactionSummary,
  SummaryMemo,
} from '@/features/send/services/paymentTransactionSummary';

const NETWORK_LABELS: Record<PaymentTransactionSummary['network'], string> = {
  TESTNET: 'Stellar testnet',
  MAINNET: 'Stellar mainnet',
};

/** Stellar amounts carry seven decimals; drop the padding without rounding. */
function trimAmount(amount: string): string {
  return amount.includes('.') ? amount.replace(/\.?0+$/, '') : amount;
}

function describeMemo(memo: SummaryMemo): string {
  if (memo.type === 'none') return 'None';
  if (memo.type === 'text') return memo.value;
  return `${memo.value} (${memo.type})`;
}

interface SummaryRowProps {
  label: string;
  value: string;
  monospace?: boolean;
}

const SummaryRow = ({ label, value, monospace = false }: SummaryRowProps) => (
  <View style={styles.row}>
    <ThemedText type="small" themeColor="textSecondary">
      {label}
    </ThemedText>
    <ThemedText type={monospace ? 'code' : 'default'} selectable>
      {value}
    </ThemedText>
  </View>
);

export interface TransactionSummaryCardProps {
  summary: PaymentTransactionSummary;
}

/**
 * Pre-signing confirmation of the decoded unsigned envelope. Nothing here is
 * signed or submitted; the parent view owns the approve action.
 */
export const TransactionSummaryCard = ({ summary }: TransactionSummaryCardProps) => (
  <Card style={styles.card} accessibilityLabel="Transaction summary before signing">
    <ThemedText type="smallBold">You are about to sign</ThemedText>
    <SummaryRow label="Amount" value={`${trimAmount(summary.amount)} ${summary.asset.code}`} />
    {summary.asset.issuer ? (
      <SummaryRow label="Asset issuer" value={summary.asset.issuer} monospace />
    ) : null}
    <SummaryRow label="To" value={summary.destination} monospace />
    <SummaryRow label="From (your wallet)" value={summary.source} monospace />
    <SummaryRow label="Memo" value={describeMemo(summary.memo)} />
    <SummaryRow
      label="Maximum network fee"
      value={`${summary.maxFeeXlm} XLM (${summary.maxFeeStroops} stroops)`}
    />
    <SummaryRow label="Network" value={NETWORK_LABELS[summary.network]} />
    <SummaryRow
      label="Valid until"
      value={summary.expiresAt ? summary.expiresAt.toLocaleString() : 'No expiry'}
    />
    <SummaryRow label="Sequence number" value={summary.sequence} monospace />
    <SummaryRow label="Transaction hash" value={summary.hash} monospace />
  </Card>
);

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  row: { gap: Spacing.half },
});
