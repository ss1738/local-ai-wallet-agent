# Threat model

## Scope and non-goals

This is an experimental, local-first testnet wallet agent. It is not audited
software and is not suitable for mainnet funds. The QVAC integration is optional:
if the SDK or a model fails, the application falls back to deterministic parsing.

## Assets to protect

- Wallet seed phrases and signing authority.
- User intent, transaction history, balances, and recipient information.
- The human confirmation decision immediately before a broadcast.

## Trust boundaries

- The language model is untrusted. It may be wrong, manipulated by an input, or
  unavailable; it can only return an `Intent` proposal.
- `PolicyEngine` is the authorization boundary. It maps proposals to a fixed
  operation set and enforces asset allow-lists, positive amounts, and a hard
  transfer limit in deterministic code.
- `WalletAgent` is the broadcast boundary. It calls `broadcastTransfer` only
  after an explicit, per-transfer confirmation succeeds.
- WDK owns the testnet key material. The app never logs a seed phrase, but a
  local machine compromise can still access local files or process memory.

## Threats and current controls

| Threat | Current control | Remaining work |
| --- | --- | --- |
| Prompt injection or hallucinated transfer | The model proposes only an intent; deterministic policy validates every field. | Add fuzz/property tests for malformed model output. |
| Model proposes a large or unsupported payment | Fixed asset allow-list, positive-amount validation, hard transfer ceiling. | Make limits configurable with secure defaults and review UX. |
| Silent transfer | A per-transfer confirmation occurs before any broadcast. A test asserts an adversarial parser cannot reach that gate when policy rejects its proposal. | Add UI-specific confirmation tests before a graphical client. |
| SDK/model failure | Dynamic QVAC loading falls back to the rule-based parser. | Test real model download and inference on supported hardware. |
| Seed disclosure | The generated testnet seed lives under `.wallet/`, which is gitignored; no seed is logged. | Encrypt or delegate secure storage before any non-testnet use. |
| Network or RPC tampering | This project is limited to Sepolia testnet and validates EVM recipient address syntax. | Pin/verify RPC trust assumptions and add chain/asset-specific transaction validation. |

## Security invariants

1. A model never receives a wallet object or signing authority.
2. A transfer is not broadcast without a fresh affirmative confirmation.
3. Policy limits are enforced in code, independently of model output.
4. The default mode uses no network, wallet seed, or downloaded model.

## Disclosure

Do not report security-sensitive details in a public issue. Contact the project
maintainer privately through the repository owner profile first.
