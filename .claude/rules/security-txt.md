---
paths:
  - "public/.well-known/security.txt"
---

# security.txt — PGP Signed File

`public/.well-known/security.txt` is PGP clearsigned (RFC 9116). **After any edit, re-sign the file:**

```bash
gpg --clearsign --default-key 0A993B268654DBBA52B7E8D3FCF653391E2C91FC \
  public/.well-known/security.txt \
  && mv public/.well-known/security.txt.asc public/.well-known/security.txt
```

Then verify: `gpg --verify public/.well-known/security.txt`

The signing key is `0A993B268654DBBA52B7E8D3FCF653391E2C91FC` (EdDSA, trusted as ultimate on the server).
Passphrase must be cached in gpg-agent before signing.
