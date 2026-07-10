import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import WDK from "@tetherto/wdk";
import WalletManagerEvm from "@tetherto/wdk-wallet-evm";
import type { Wallet } from "./wallet.js";
import type { DraftTransfer, TxRecord } from "../types.js";

const CHAIN = "ethereum";
const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export interface WdkConfig {
  /** Provide a seed directly, or leave unset to use WDK_SEED / a gitignored file. */
  seedPhrase?: string;
  /** Testnet RPC. Defaults to a public Sepolia endpoint. */
  rpc?: string;
  /** Where a generated testnet seed is persisted (gitignored). */
  seedFile?: string;
}

/**
 * A real self-custodial wallet backed by Tether's WDK, pointed at the Sepolia
 * testnet. This milestone is read-only: it derives a real address and reads a
 * real on-chain balance. draftTransfer stays a local dry-run and never calls
 * sendTransaction, so nothing is ever broadcast. Signing/broadcast is a
 * separate, gated step delivered later, still behind the confirmation gate.
 *
 * Keys never leave the device: WDK holds them, the app only reads.
 */
export class WdkWallet implements Wallet {
  private accountPromise: Promise<{
    getAddress(): Promise<string>;
    getBalance(): Promise<unknown>;
  }>;

  constructor(cfg: WdkConfig = {}) {
    const seed = cfg.seedPhrase ?? loadOrCreateSeed(cfg.seedFile ?? ".wallet/seed.json");
    // WalletManagerEvm and WDK's base WalletManager each declare a private _seed,
    // so their shipped types are nominally incompatible although the runtime call
    // is correct (verified live against Sepolia). Cast narrowly to satisfy tsc.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wdk = new WDK(seed).registerWallet(CHAIN, WalletManagerEvm as any, {
      provider: cfg.rpc ?? DEFAULT_RPC,
    });
    this.accountPromise = wdk.getAccount(CHAIN, 0);
  }

  async getAddress(): Promise<string> {
    const account = await this.accountPromise;
    return account.getAddress();
  }

  assetLabel(): string {
    return "ETH (Sepolia testnet)";
  }

  async getBalance(_asset: string): Promise<number> {
    const account = await this.accountPromise;
    const raw = await account.getBalance();
    // EVM balances come back in wei; format to ether for display.
    const wei = BigInt((raw as { toString(): string })?.toString?.() ?? String(raw));
    return Number(wei) / 1e18;
  }

  async getHistory(_limit = 10): Promise<TxRecord[]> {
    // The WDK history module is not wired yet. Returning empty keeps the risk
    // gate conservative (every recipient reads as new). Real history lands next.
    return [];
  }

  async draftTransfer(input: {
    amount: number;
    asset: string;
    recipient: string;
  }): Promise<DraftTransfer> {
    // Build a draft only. sendTransaction is intentionally NOT called here, so
    // nothing is broadcast in this milestone.
    return {
      amount: input.amount,
      asset: input.asset,
      recipient: input.recipient,
      networkFeeEstimate: 0,
      broadcast: false,
    };
  }

  async knownRecipients(): Promise<string[]> {
    return [];
  }
}

function loadOrCreateSeed(file: string): string {
  if (process.env.WDK_SEED) return process.env.WDK_SEED;
  const path = resolve(file);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8")).seed as string;
  }
  const seed = WDK.getRandomSeedPhrase();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      { seed, note: "TESTNET ONLY. Do not fund with real assets. This file is gitignored." },
      null,
      2,
    ),
  );
  console.log(`Generated a new testnet seed and saved it to ${file} (gitignored). Testnet only.`);
  return seed;
}
