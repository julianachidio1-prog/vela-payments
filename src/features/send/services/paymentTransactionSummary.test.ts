import {
  Account,
  Asset,
  FeeBumpTransaction,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
  type xdr,
} from '@stellar/stellar-sdk';

import { env } from '@/lib/env';
import {
  assertSigningMatchesSummary,
  buildPaymentTransactionSummary,
  isPaymentSummaryExpired,
  stroopsToXlm,
} from './paymentTransactionSummary';

// Throwaway keypairs generated per run; nothing here touches the network.
const payer = Keypair.random();
const receiver = Keypair.random();
const usdc = new Asset('USDC', env.usdcIssuer);

const EXPIRES_AT_SECONDS = 1_900_000_000;

interface EnvelopeOptions {
  asset?: Asset;
  amount?: string;
  memo?: Memo;
  maxTime?: number;
  operations?: xdr.Operation[];
  baseFee?: string;
  sequence?: string;
}

function buildEnvelope(options: EnvelopeOptions = {}) {
  const builder = new TransactionBuilder(new Account(payer.publicKey(), options.sequence ?? '41'), {
    fee: options.baseFee ?? '100',
    networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: options.maxTime ?? EXPIRES_AT_SECONDS },
    memo: options.memo,
  });

  const operations = options.operations ?? [
    Operation.payment({
      destination: receiver.publicKey(),
      asset: options.asset ?? Asset.native(),
      amount: options.amount ?? '12.5',
    }),
  ];
  operations.forEach((operation) => builder.addOperation(operation));
  return builder.build();
}

describe('buildPaymentTransactionSummary', () => {
  it('summarizes a native payment from the unsigned envelope', () => {
    const transaction = buildEnvelope({ memo: Memo.text('coffee') });

    const summary = buildPaymentTransactionSummary(transaction.toXDR(), Networks.TESTNET);

    expect(summary).toEqual({
      network: 'TESTNET',
      hash: transaction.hash().toString('hex'),
      source: payer.publicKey(),
      destination: receiver.publicKey(),
      asset: { code: 'XLM', issuer: null },
      amount: '12.5000000',
      memo: { type: 'text', value: 'coffee' },
      maxFeeStroops: '100',
      maxFeeXlm: '0.00001',
      sequence: '42',
      expiresAt: new Date(EXPIRES_AT_SECONDS * 1000),
    });
  });

  it('includes the issuer for credit assets', () => {
    const transaction = buildEnvelope({ asset: usdc, amount: '3' });

    const summary = buildPaymentTransactionSummary(transaction.toXDR(), Networks.TESTNET);

    expect(summary.asset).toEqual({ code: 'USDC', issuer: env.usdcIssuer });
    expect(summary.memo).toEqual({ type: 'none' });
  });

  it('surfaces non-text memos instead of hiding them', () => {
    const idMemo = buildPaymentTransactionSummary(
      buildEnvelope({ memo: Memo.id('987654321') }).toXDR(),
      Networks.TESTNET
    );
    const hashMemo = buildPaymentTransactionSummary(
      buildEnvelope({ memo: Memo.hash('ab'.repeat(32)) }).toXDR(),
      Networks.TESTNET
    );

    expect(idMemo.memo).toEqual({ type: 'id', value: '987654321' });
    expect(hashMemo.memo).toEqual({ type: 'hash', value: 'ab'.repeat(32) });
  });

  it('reports no expiry when the envelope has an open upper time bound', () => {
    const summary = buildPaymentTransactionSummary(
      buildEnvelope({ maxTime: 0 }).toXDR(),
      Networks.TESTNET
    );

    expect(summary.expiresAt).toBeNull();
  });

  it('labels the network from the passphrase used to decode the envelope', () => {
    const transaction = buildEnvelope();

    expect(buildPaymentTransactionSummary(transaction.toXDR(), Networks.PUBLIC).network).toBe(
      'MAINNET'
    );
    expect(() =>
      buildPaymentTransactionSummary(transaction.toXDR(), 'Standalone Network ; February 2017')
    ).toThrow('Unsupported Stellar network passphrase.');
  });

  it('rejects a missing envelope', () => {
    expect(() => buildPaymentTransactionSummary('', Networks.TESTNET)).toThrow(
      'Payment intent is missing its unsigned transaction.'
    );
  });

  it('rejects envelopes with more than one operation', () => {
    const payment = Operation.payment({
      destination: receiver.publicKey(),
      asset: Asset.native(),
      amount: '1',
    });
    const transaction = buildEnvelope({ operations: [payment, payment] });

    expect(() => buildPaymentTransactionSummary(transaction.toXDR(), Networks.TESTNET)).toThrow(
      'Payment transaction must contain exactly one operation.'
    );
  });

  it('rejects non-payment operations', () => {
    const transaction = buildEnvelope({
      operations: [Operation.changeTrust({ asset: usdc })],
    });

    expect(() => buildPaymentTransactionSummary(transaction.toXDR(), Networks.TESTNET)).toThrow(
      'Payment transaction does not contain a payment operation.'
    );
  });

  it('rejects fee-bump envelopes', () => {
    const inner = buildEnvelope();
    inner.sign(payer);
    const feeBump: FeeBumpTransaction = TransactionBuilder.buildFeeBumpTransaction(
      Keypair.random(),
      '200',
      inner,
      Networks.TESTNET
    );

    expect(() => buildPaymentTransactionSummary(feeBump.toXDR(), Networks.TESTNET)).toThrow(
      'Fee-bump payment envelopes are not supported.'
    );
  });
});

describe('stroopsToXlm', () => {
  it.each([
    ['0', '0'],
    ['1', '0.0000001'],
    ['100', '0.00001'],
    ['10000000', '1'],
    ['123456789', '12.3456789'],
    ['900000000000', '90000'],
  ])('converts %s stroops to %s XLM', (stroops, xlm) => {
    expect(stroopsToXlm(stroops)).toBe(xlm);
  });

  it.each(['', '-1', '1.5', 'abc'])('rejects %p', (value) => {
    expect(() => stroopsToXlm(value)).toThrow('Transaction fee is not a valid stroop amount.');
  });
});

describe('isPaymentSummaryExpired', () => {
  const expiresAt = new Date(EXPIRES_AT_SECONDS * 1000);

  it('is false before the upper time bound', () => {
    expect(isPaymentSummaryExpired({ expiresAt }, expiresAt.getTime() - 1)).toBe(false);
  });

  it('is true at and after the upper time bound', () => {
    expect(isPaymentSummaryExpired({ expiresAt }, expiresAt.getTime())).toBe(true);
    expect(isPaymentSummaryExpired({ expiresAt }, expiresAt.getTime() + 1)).toBe(true);
  });

  it('never expires without an upper bound', () => {
    expect(isPaymentSummaryExpired({ expiresAt: null }, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe('assertSigningMatchesSummary', () => {
  const beforeExpiry = EXPIRES_AT_SECONDS * 1000 - 60_000;

  it('accepts the exact envelope that was reviewed', () => {
    const xdrEnvelope = buildEnvelope().toXDR();
    const reviewed = buildPaymentTransactionSummary(xdrEnvelope, Networks.TESTNET);

    expect(() =>
      assertSigningMatchesSummary(reviewed, xdrEnvelope, Networks.TESTNET, beforeExpiry)
    ).not.toThrow();
  });

  it('blocks signing when the envelope differs from the reviewed one', () => {
    const reviewed = buildPaymentTransactionSummary(buildEnvelope().toXDR(), Networks.TESTNET);
    const swapped = buildEnvelope({ amount: '125' }).toXDR();

    expect(() =>
      assertSigningMatchesSummary(reviewed, swapped, Networks.TESTNET, beforeExpiry)
    ).toThrow('The transaction changed after review. Scan the request again.');
  });

  it('blocks signing once the reviewed envelope has expired', () => {
    const xdrEnvelope = buildEnvelope().toXDR();
    const reviewed = buildPaymentTransactionSummary(xdrEnvelope, Networks.TESTNET);

    expect(() =>
      assertSigningMatchesSummary(
        reviewed,
        xdrEnvelope,
        Networks.TESTNET,
        EXPIRES_AT_SECONDS * 1000
      )
    ).toThrow('This transaction expired before it was signed. Scan a new request.');
  });
});
