# Standalone OAuth storage and diagnostic boundary

The standalone OAuth utilities and shared token-refresh config writer now create
session and .env files privately
(mode 0600 on POSIX), reject nonregular destinations and symlink destinations on systems with O_NOFOLLOW, and refuse to write
an existing file accessible to group/others. Existing credentials or permissions
are never automatically changed. If an old file is rejected, review its exposure
and explicitly approve any permission/credential remediation before retrying.
Private service directories are required; Windows ACLs need operator verification.
This is not an atomic crash-recovery or hostile-local-filesystem guarantee.

Provider token response bodies are omitted from errors, and provider response
metadata is no longer printed after success. Token/expiry values containing
unsupported formats are rejected before .env storage. Generic success/failure
messages remain. HTTP listener/OAuth provider behavior and actual consent flows
are unchanged. Tests use synthetic responses and temporary files only, with fetch
fully replaced; no provider account, real credential or live OAuth call is used.

The standalone MCP HTTP transport is unauthenticated and defaults to loopback.
Do not expose it directly to public/untrusted networks; CORS is not authentication.
Remote access needs an authenticated, isolated deployment boundary. These storage
changes do not add HTTP authentication or change live-publish opt-in requirements.
