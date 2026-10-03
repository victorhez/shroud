<div align="center">

# Shroud

**From zero to your first shielded Zcash transaction, in one afternoon.**

An interactive course with real tools: an address decoder, a payment-request builder and a *Leak Lab* that shows what a chain observer would learn from your plan. It runs entirely in your browser and makes no network requests.

[Course](#the-course) · [Workshop](#the-workshop) · [Privacy model](#privacy-model) · [How it works](#how-it-works) · [Testing](#testing)

</div>

---

## Why this exists

Zcash has had strong, battle-tested privacy for years, and most people still hold their coins transparently. The reason isn't cryptography, it's friction. Getting started means learning about pools, address types, memos and the one-way doorway between public and private balances, and nobody tells you that the most common way to lose your privacy is not a protocol flaw. It's a habit: shield 10 ZEC, then withdraw exactly 10 ZEC to the same address twenty minutes later.

Shroud closes that gap. It teaches the concepts in six short chapters, then gives you instruments that *think*, so you can check your own plan before you touch real funds.

## The course

Six chapters, each with a checklist you complete in your own wallet. Progress is stored only in your browser's local storage.

| # | Chapter | You will |
|---|---------|----------|
| 1 | Get a wallet | Choose and set up a wallet, back up the recovery phrase safely |
| 2 | Get some ZEC | Acquire a small amount and receive it, test-amount first |
| 3 | Read an address | Understand transparent, Sapling, Orchard and Unified addresses |
| 4 | Shield | Move funds into the shielded pool and know exactly what that reveals |
| 5 | Send privately | Make a shielded payment with an encrypted memo; build a payment request |
| 6 | Unshield, or don't | Exit the pool without creating a trail |

## The workshop

### Leak Lab
Describe a sequence of moves (shield, send privately, unshield, send publicly) and Leak Lab shows:

- **What the observer sees** at every step, field by field, versus what stays hidden.
- **Linkage findings** ranked by severity: exact and near-exact amount matches between entry and exit, subset-sum matches across several deposits, timing proximity, round-trips to the funding address, split withdrawals, and amount leakage when crossing between Sapling and Orchard.
- A **privacy score** with concrete fixes ("unshield a different amount", "wait days, not minutes").

It models *on-chain* linkage only and says so. It cannot see your IP address, an exchange's records or a compromised device.

### Address Inspector
Paste any Zcash address and it is decoded locally: network, pool membership, and for Unified Addresses every individual receiver. It performs a complete ZIP-316 decode (Bech32m checksum, F4Jumble inversion, HRP padding check, typecode parsing) rather than guessing from the prefix. It also recognises **seed phrases, spending keys and viewing keys**, refuses to process them and clears the field.

### Request Builder
Creates [ZIP-321](https://zips.z.cash/zip-0321) payment URIs and QR codes with amount, memo and label. It enforces the spec's rules: memos only for shielded recipients, 512-byte limit, 8-decimal amounts, supply cap.

## Privacy model

Teaching privacy from a page that tracks you would be absurd, so Shroud is built so that it *cannot*.

- **Static site.** No backend, no database, no accounts.
- **Zero network requests.** A strict Content Security Policy (`default-src 'none'`, `connect-src 'none'`, same-origin scripts and styles only) forbids the page from contacting anything. Fonts are system fonts; the QR encoder is vendored.
- **Verifiable.** The footer badge counts cross-origin requests live via the Performance API. Or open your browser's Network tab.
- **Nothing you type is stored or logged.** The only persisted data is the course checkboxes and the theme choice.
- **Secrets are refused.** The Inspector detects seed phrases and key prefixes before doing anything else.

**What Shroud does not protect against:** your IP address (use Tor or a VPN), what an exchange already knows about you, or malware on your device. These limits are stated in the app.

## How it works

```
index.html            semantic markup, course content, CSP
css/style.css         design system (dark/light, reduced-motion aware)
js/
  main.js             page chrome, course progress, scroll-spy, live request counter
  tools.js            Leak Lab, Inspector and Request Builder UI + QR rendering
  leaklab.js          pure analysis engine (no DOM), fully unit tested
  dom.js              tiny helpers; text is only ever inserted via textContent
  zcash/
    blake2b.js        BLAKE2b with personalization (RFC 7693) in plain JS
    f4jumble.js       ZIP-316 F4Jumble and its inverse
    checksums.js      Bech32 / Bech32m, Base58Check, SHA-256
    address.js        address classification and Unified Address decoding
    zip321.js         payment request URIs
  vendor/qrcode.min.js  qrcode-generator 1.5.2, byte-mode build (MIT)
test/                 node:test suites
```

Protocol pieces are implemented from the specifications, with no runtime dependencies other than the vendored QR encoder:

| Spec | Used for |
|------|----------|
| [ZIP-316](https://zips.z.cash/zip-0316) | Unified Address encoding and F4Jumble |
| [ZIP-320](https://zips.z.cash/zip-0320) | TEX (transparent-source-only) addresses |
| [ZIP-321](https://zips.z.cash/zip-0321) | Payment request URIs |
| [ZIP-317](https://zips.z.cash/zip-0317) | Fee model used in the Leak Lab |
| [ZIP-224](https://zips.z.cash/zip-0224) | Orchard pool semantics |

## Testing

```bash
npm test
```

The suite includes the official Unified Address vectors from [`zcash-test-vectors`](https://github.com/zcash/zcash-test-vectors) (decode, re-encode byte-for-byte, and F4Jumble in both directions), BLAKE2b checked against RFC 7693 and Node's native implementation, corrupted-checksum rejection, secret detection, ZIP-321 round trips and rule enforcement, and the Leak Lab's detection logic and severity grading. CI runs it on every push.

## Run locally

Requires Node 20+. There is nothing to install.

```bash
npm run dev      # serves http://localhost:4173
```

## Self-hosting

Shroud is a folder of static files and works on any static host. `vercel.json` and `_headers` ship the same strict security headers the page declares in its CSP (including `frame-ancestors`, which can only be set by HTTP header).

## Scope and honesty

Shroud is an *educational and hygiene* tool. It does not create wallets, hold keys or broadcast transactions. You do those in a wallet you trust. The Leak Lab is a transparent rule-based model of well-known linkage heuristics, not a proof of anonymity, and the app tells you so. Wallet names, fees and exchange support change; verify with each project.

## License

MIT. See [LICENSE](LICENSE). Vendored QR encoder: © Kazuhiko Arase, MIT.
