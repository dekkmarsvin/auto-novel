# NAILAIN access and settings contract

The maintainer approved serving NAILAIN content to public readers on 2026-10-14.
The existing public novel/chapter read routes use the server's shared source
session. This decision applies to NAILAIN; it does not change other providers'
access rules. Setting the source password remains administrator-only through
database-authenticated GET/PUT `/site-setting/nailain-password`.

Mongo `site-setting` is authoritative when its password is nonempty. Saving
trims surrounding whitespace. Saving an empty string restores `NAILAIN_PASSWORD`
as the fallback; it does not disable the provider when that environment value is
configured. If both are absent/empty, a new source login fails. A database read
failure fails the login rather than silently switching credentials.

Passwords are read on source login after a 401. Updating or clearing the setting
does not revoke existing `na_session` cookies or remove already stored novel
content. The next required login reads the current setting. Providers perform
one login and at most one post-login retry per content request.

The admin GET returns the Mongo value, never the environment fallback. GET/PUT
responses use `Cache-Control: no-store`; the frontend requests no cache and does
not retry these setting operations. The password input is masked and does not
persist to browser storage. Late responses cannot overwrite edited drafts or
restore them after logout, account/role changes, or leaving the page. Successful
saves clear the submitted draft; errors keep an authorized draft for retry and
display generic messages without exception details.

This PR retains plaintext password storage in Mongo. Database snapshots and
backups therefore contain the source credential and must be restricted to
deployment administrators, encrypted where stored/transferred, and excluded
from public artifacts and logs. This is an operational boundary, not a claim
that application encryption or backup hardening was implemented here.

`NAILAIN offline regressions` runs isolated transport, settings authorization,
Mongo-driver mock, fallback and Vue draft tests without production Mongo,
credentials, or source-site requests. Environment-gated live tests remain
separate and are not CI evidence.

The external browser addon still lacks NAILAIN host permission and fork-domain
injection support. Server metadata success uses the server path; the existing
server-error fallback cannot overcome these addon limitations.
