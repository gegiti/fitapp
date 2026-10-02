---
name: dropbox-console-scopes
description: Dropbox app permissions must be ticked AND submitted in the console; how to verify scopes remotely and why a scope-less token looks "connected"
metadata:
  type: project
---

On 2026-09-05 the first on-phone Dropbox connect "succeeded" but every file call failed. Root cause: the fitapp Dropbox app had no file scopes enabled in the console's Permissions tab (files.metadata.read, files.content.read, files.content.write), so the token only carried account_info.read.

**Why:** OAuth login works without the scopes, so the app stores a refresh token and shows "connected", while list/download/upload return 401 missing_scope. Since v1.2.1 the authorize URL requests the scopes explicitly and a persistent 401 disconnects with an explanatory toast. Tokens issued before a permission change never gain the new scopes: the user must Disconnect and Connect again.

Later the same day the login itself failed with "Dropbox connection failed": the PKCE verifier shared a storage record with the tokens, so a refresh or disconnect during the Dropbox page wiped it (fixed in v1.2.3 with a separate `.login` key, idempotent finishAuth, and `force_reapprove=true`). On-phone verification of the whole connect flow was still pending at the end of 2026-09-05.

**How to apply:** To check the console remotely without credentials, request the authorize URL with `&scope=<scope>` via curl: a 302 to `authorize_error?...error_name=scope_not_granted` means the scope is not enabled; 200 means it is. Related: [[dropbox-sync-decisions]].
