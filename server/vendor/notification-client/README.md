# notification-client (vendored)

`client.js` is the server-side client of the notification service, copied from
`priyanshu-48/notification-service`, `sdk/` (built with `npm run sdk:build`), at commit `88c1c35`.
It has no dependencies. The only change is that the trailing `//# sourceMappingURL` comment was removed, because the map file is not vendored. Only the server-side `NotificationClient` is used here; the tracker's
dashboard vendors the browser stream separately.

To update it: rebuild the SDK in the notification-service repo and copy `sdk/dist/client.js` over this file.
Do not edit it here otherwise. It is vendored instead of installed because the SDK is not published to npm.
