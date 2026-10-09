# Do `/file/` attachment downloads need auth?

Ticket: #4. Source checked: ntfy server source (current `main` checkout), files under `server/`, `model/` and `docs/`.

## Answer

No. `GET`/`HEAD /file/<id>` is not behind any ACL check, even on a server with
`auth-default-access: deny-all`. The 12-character random message ID in the URL is
the only protection. Our unauthenticated download in `image_cache.rs` works, and that is
how ntfy is designed, not a gap we're getting through by luck.

There is one catch. If you do send an `Authorization` header and it's wrong (expired
token, changed password), the server rejects the request with 401 before it reaches the
file route. So adding auth can break downloads that work fine without it.

## Evidence

- **Route has no authorize wrapper.** `server/server.go:742-743` routes `/file/...` through
  `s.limitRequests(s.handleFile)` only. Subscribe routes right below use
  `s.limitRequests(s.authorizeTopicRead(...))` (`server/server.go:759-767`). `limitRequests`
  only does rate limiting (`server/server_middleware.go:19-28`).
- **handleFile never looks at the user or topic.** `server/server.go:830-884` reads the file by
  message ID, sets `Content-Length`, returns for HEAD, and for GET looks up the message only so it
  can charge download bandwidth to the uploader (comment at `:852-855`).
- **The ID is the secret.** URL is `<base-url>/file/<message-id><ext>` (`server/server.go:1460`).
  The message ID is `util.RandomString(12)` (`model/model.go:23`, `:168`).
- **Bad credentials fail every route.** `server/server.go:570-573` runs `maybeAuthenticate` on every
  request and aborts on error. With an `Authorization` header that doesn't check out it returns
  `errHTTPUnauthorized` (`server/server_auth.go:45-49`). With no header it passes as anonymous
  (`server/server_auth.go:35-40`).
- **External attachments (`Attach: https://other.host/...`)** are never fetched or proxied by ntfy.
  The URL is just stored on the message and the body is treated as text (`server/server.go:1375-1376`,
  `:1390-1391`). Whether that URL needs auth is up to the other host, and ntfy doesn't know anything about it.
- **Expiry.** Uploaded attachments expire after `attachment-expiry-duration` (default 3h,
  `docs/config.md:528`, `:2385`), and never outlive their message (`server/server.go:1439-1442`).
  The expiry time goes out to clients as `attachment.expires` (unix seconds, `server/server.go:1458`).
  The manager marks expired attachments deleted, and the store's sync loop removes the files
  (`server/server_manager.go:142-166`). After that, `/file/<id>` returns **404** (`errHTTPNotFound`,
  `server/server.go:839-845`, `server/errors.go:155`), never 410. If the message row is gone but the
  file isn't yet, GET also returns 404 (`server/server.go:856-870`), while HEAD can still return 200 for a short time.

## What the client should do

1. **Keep downloading `/file/` URLs without credentials.** Don't add auth to `image_cache.rs` or to
   the `HEAD` check in `NotificationAttachments.tsx`. It isn't needed, and a stale token would turn a
   working download into a 401.
2. **Never send our server's credentials to external attachment URLs.** They point at someone else's host.
3. **Expiry:** if `attachment.expires` is set and is in the past, show the attachment as expired
   without making a request. Treat 404 from our own server's `/file/` as "expired". Don't expect a 410.
   Don't retry on 404, and don't cache a failure as an image.
