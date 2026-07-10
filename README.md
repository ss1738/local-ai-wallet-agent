# Local AI Wallet Agent

An on-device AI agent for self-custodial payments. You ask in plain language, it drafts the wallet operation, checks it for risk locally, and does nothing until you confirm. No cloud, no custody of your keys.

Built to run on Tether's open stack: QVAC for on-device AI and WDK for the self-custodial wallet. This repository currently ships a runnable skeleton with mock adapters so the full flow works today. The QVAC and WDK integrations land per the roadmap below.

## Status

M1 skeleton. The end-to-end flow runs against an in-memory mock wallet in testnet dry-run mode, so nothing is ever broadcast. Rule-based intent parsing and a rule-based risk gate stand in for the QVAC model and the trained anomaly model, which arrive in M1 completion and M2.

## Why

Wallet UX assumes a human clicking through forms, and AI money assistants almost always run in the cloud and take custody of keys. This does the opposite: the intelligence runs on your device (QVAC) and you always hold your keys (WDK). The agent only proposes; you decide.

## Safety model

- No custody. The wallet layer holds the keys; the agent can propose but never independently move funds.
- Human in the loop. Every transfer stops at an explicit confirmation. No silent or automatic sends.
- Bounded action space. The model's output is mapped to a fixed set of vetted operations in deterministic code. A wrong or manipulated model cannot invent an action.
- On-device risk gate. Unusual transfers are flagged before confirmation. Limits are enforced in code, not by the model.
- Testnet first, local by default. No transaction data leaves the device.

## Architecture

```
natural language
      |
  intent parser        rule-based now, QVAC LLM later
      |
  policy engine         deterministic: bounded operations, hard limits
      |
   +--+----------------+
   |                   |
 read / draft        risk engine
 via wallet          rule-based now, trained model in M2
 (WDK later)
      |
 confirmation gate     human in the loop
      |
 dry-run (M1) or signed WDK broadcast (later)
```

The model reaches the wallet through the policy layer only. It proposes an intent; deterministic code decides the operation and enforces the limits.

## Run

Requires Node 20 or newer (QVAC will require Node 22 once wired).

```
npm install
npm run dev
```

Then try:

```
balance
history
send 40 usdt to alex
send 800 usdt to 0xnewaddress
```

The last one is flagged as higher risk (new recipient, large amount) and still stops for your confirmation before doing anything.

## Roadmap

- M1: wallet and AI foundation. Natural language to drafted transfer, confirmation gate, testnet dry-run. Wire QVAC for intent parsing and WDK for the real self-custodial wallet.
- M2: on-device transaction risk model and retrieval-augmented spending insights over local history.
- M3: Expo mobile app (self-custodial via WDK), documentation, threat model, tagged release.

## License

Apache-2.0. See [LICENSE](LICENSE).
