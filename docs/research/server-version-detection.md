# Detecting ntfy >= 2.17 without admin access

Research for issue #2. Checked on 2026-10-09 against the ntfy source at tags v2.16.0 and v2.17.0, plus current `main`.

## Answer

Nothing public reports the version. `/v1/config`, `/config.js` and the response headers were not changed between 2.16 and 2.17, so none of them can tell the two apart. Two endpoints do behave differently, and between them they cover every setup:

1. **`GET /v1/version`** returns `401` on 2.17+ and `404` on older versions, but only when the server has auth configured. Without auth it returns `404` on every version.
2. **An invalid `copy` action** is the probe that works with no auth. Publish with `X-Actions: copy, probe` and no value. Every version rejects it with `400`, so nothing gets published, but the error text differs:
   - 2.17+: `parameter 'value' is required for action 'copy'`
   - < 2.17: `parameter 'action' cannot be 'copy', valid values are 'view', 'broadcast' and 'http'`

## Evidence

The diff `v2.16.0...v2.17.0` (GitHub compare API) changes no field in `apiConfigResponse` and adds no public route. Its server-side changes are the admin-only version endpoint, the `copy` action and priority templating.

**`/v1/version`**
- v2.17.0 `server/server.go:471-472`: `GET /v1/version` → `s.ensureAdmin(s.handleVersion)`.
- v2.16.0 `server/server.go:571`: no such route, so the request reaches the final `return errHTTPNotFound` (40401).
- main `server/server_middleware.go:72-79`: `ensureAdmin` sits inside `ensureUserManager`, which returns `errHTTPNotFound` when `userManager == nil`. A server without auth therefore answers 404 on 2.17+ as well. With auth, a non-admin or anonymous caller gets `errHTTPUnauthorized` (40101, HTTP 401).
- Live check: `curl https://ntfy.sh/v1/version` → `{"code":40101,"http":401,...}`. `/v1/versionx` → 40401.

**`copy` action**
- v2.16.0 `server/actions.go:64`: `copy` is not in `actionsAll`, so the error is "cannot be 'copy', valid values are 'view', 'broadcast' and 'http'".
- v2.17.0 `server/actions.go:73`: `copy` is valid, and a missing value gives "parameter 'value' is required for action 'copy'". On main the same text is at `action/action.go:76`.
- Both versions parse actions in `parsePublishParams` (v2.16.0 `server/server.go:1158`, v2.17.0 `:1171`) and return `40018` before the body is handled. No message is stored or sent.
- The publish route is wrapped in `authorizeTopicWrite` (v2.16.0 `server/server.go:547-557`). When `userManager == nil` that check is skipped (main `server/server_middleware.go:155-157`), so with auth off anyone can run the probe. With auth on, the caller needs write access to the topic or the server returns 403 first.
- Live check: `curl -H "X-Actions: copy, probe" -d "" https://ntfy.sh/<random-topic>` → `{"code":40018,"http":400,"error":"invalid request: actions invalid; parameter 'value' is required for action 'copy'"}`.

## Recommendation

Probe once per server and cache the result:

1. `GET /v1/version` with the user's credentials, if there are any.
   - `200` or `401`/`403` → **>= 2.17**.
   - `404` → no verdict yet, go to step 2.
2. `POST /<random topic>` with header `X-Actions: copy, probe` and an empty body, with credentials if the server uses them.
   - `400` and the error contains `'value' is required for action 'copy'` → **>= 2.17**.
   - `400` and the error contains `cannot be 'copy'` → **< 2.17**.
   - Any other response (403, 429, a proxy page) → **unknown**. Treat it as < 2.17, or let the user override.

Step 1 settles the question for any 2.17+ server with auth. A 404 there means either an older server or a server without auth. Step 2 handles both. Without auth, anonymous writes are always allowed. On an older server with auth, step 2 works as long as the user, or anonymous access, can write to topics; a read-only user gets 403, which counts as unknown.

Limitations:
- Step 2 matches on English error text. It has stayed the same from v2.17.0 through main, but a later release could reword it.
- A reverse proxy that blocks `/v1/version` would break step 1. It still falls through to step 2.
- None of this gives an exact version, only whether the server is at least 2.17.
