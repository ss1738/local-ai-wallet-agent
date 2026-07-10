export type IntentKind =
  | "balance"
  | "history"
  | "address"
  | "transfer"
  | "insights"
  | "unknown";

export interface Intent {
  kind: IntentKind;
  amount?: number;
  asset?: string;
  recipient?: string;
  query?: string;
  raw: string;
}

export type OperationType =
  | "read_balance"
  | "read_history"
  | "read_address"
  | "draft_transfer"
  | "answer_insights";

export interface Operation {
  type: OperationType;
  amount?: number;
  asset?: string;
  recipient?: string;
  query?: string;
}

export interface TxRecord {
  date: string;
  direction: "in" | "out";
  amount: number;
  asset: string;
  counterparty: string;
}

export interface DraftTransfer {
  amount: number;
  asset: string;
  recipient: string;
  networkFeeEstimate: number;
  /** Always false. A draft is never broadcast. */
  broadcast: boolean;
}

export interface BroadcastResult {
  hash: string;
  /** true when no real network was touched (mock wallet). */
  simulated: boolean;
}

export type RiskLevel = "low" | "medium" | "high";

export interface RiskAssessment {
  /** 0 (normal) to 1 (highly unusual). */
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface PolicyDecision {
  allowed: boolean;
  operation?: Operation;
  reason?: string;
}
