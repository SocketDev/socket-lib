# Signed fixtures

These public fixtures retain their signed identities because changing an identity invalidates its certificate and signature.
They are verification inputs, not production trust configuration.
Tests do not send requests to the identities or endpoints in these files.

| File | Source | SHA-256 |
| --- | --- | --- |
| `public-bundle.json` | [Packslip v1.4.0 bundle](https://github.com/jdx/packslip/releases/download/v1.4.0/packslip.sigstore.json) | `a3234509040d78280fe8a8d4983c6aaaecb1edf29410b5908efd02e3271b3e6c` |
| `private-bundle.json` | [GitHub CLI fixture](https://github.com/cli/cli/blob/9b031151a825bda919203c5202876a725d637368/pkg/cmd/attestation/test/data/github_provenance_demo-0.0.12-py3-none-any-bundle.jsonl) | `b1a9a540599aa66c76fbe8620b7c230ceb9abfa839381fa66152a73c22bcbe5b` |
| `public-root.json` | `sigstore-trust-root` 0.11.0 crate, `trusted_root.json` | `6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66` |
| `private-root.json` | `sigstore-trust-root` 0.11.0 crate, `trusted_root_github.json` | `484cdfe1a7c65479c5ba2a22193d1be90f0020db1997de696ab207434c62fbb7` |

Packslip and GitHub CLI use the MIT license.
The Sigstore trust-root crate uses the Apache-2.0 license.
The source crate SHA-256 is `389b54d1b8ace20ba86fdf90e5e655495f65f1abbc7d5d0eb7494defa9ad32f0`.
The original GitHub CLI JSONL SHA-256 is `4f8c096e38a0eee242574ab100d16701928605409225e59784a3636f742bb27e`.
