import type { BroadcastResult, DraftTransfer, TxRecord } from "../types.js";

export interface Wallet {
  /** Read-only. The wallet's receive address. */
  getAddress(): Promise<string>;
  /** The native asset this wallet reports balances in. */
  assetLabel(): string;
  /** Read-only. Current balance for an asset. */
  getBalance(asset: string): Promise<number>;
  /** Read-only. Recent transaction history. */
  getHistory(limit?: number): Promise<TxRecord[]>;
  /** Build an unsigned, un-broadcast transfer for review. Never sends. */
  draftTransfer(input: {
    amount: number;
    asset: string;
    recipient: string;
  }): Promise<DraftTransfer>;
  /** Sign and broadcast a transfer. Only ever called after human confirmation. */
  broadcastTransfer(input: {
    amount: number;
    asset: string;
    recipient: string;
  }): Promise<BroadcastResult>;
  /** Previously used recipients, consumed by the risk layer. */
  knownRecipients(): Promise<string[]>;
}

/**
 * In-memory stand-in for a WDK self-custodial wallet.
 *
 * It lets the full agent flow run on synthetic, testnet-shaped data today. A
 * WdkWallet implementing this same interface replaces it later; with WDK the
 * application never holds the private keys.
 */
export class MockWallet implements Wallet {
  private balances: Record<string, number> = { USDt: 1250.0, BTC: 0.032 };
  private history: TxRecord[] = [
    { date: "2026-07-02", direction: "out", amount: 40, asset: "USDt", counterparty: "alex" },
    { date: "2026-07-01", direction: "in", amount: 500, asset: "USDt", counterparty: "payroll" },
    { date: "2026-06-28", direction: "out", amount: 12.5, asset: "USDt", counterparty: "coffee-shop" },
    { date: "2026-06-25", direction: "out", amount: 300, asset: "USDt", counterparty: "landlord" },
  ];
  private recipients = ["alex", "payroll", "coffee-shop", "landlord"];

  async getAddress(): Promise<string> {
    return "0xMockWa11et000000000000000000000000000000";
  }

  assetLabel(): string {
    return "USDt";
  }

  async getBalance(asset: string): Promise<number> {
    return this.balances[asset] ?? 0;
  }

  async getHistory(limit = 10): Promise<TxRecord[]> {
    return this.history.slice(0, limit);
  }

  async draftTransfer(input: {
    amount: number;
    asset: string;
    recipient: string;
  }): Promise<DraftTransfer> {
    return {
      amount: input.amount,
      asset: input.asset,
      recipient: input.recipient,
      networkFeeEstimate: 0.01,
      broadcast: false,
    };
  }

  async broadcastTransfer(input: {
    amount: number;
    asset: string;
    recipient: string;
  }): Promise<BroadcastResult> {
    // The mock wallet never touches a network. It returns a clearly simulated
    // hash so the confirmed path can be demonstrated without any real send.
    const seed = Buffer.from(`sim:${input.amount}:${input.asset}:${input.recipient}`)
      .toString("hex")
      .padEnd(64, "0")
      .slice(0, 64);
    return { hash: `0x${seed}`, simulated: true };
  }

  async knownRecipients(): Promise<string[]> {
    return this.recipients;
  }
}
