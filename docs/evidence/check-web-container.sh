#!/usr/bin/env bash
# Checks the production web container (nginx serving the built dashboard) of the compose stack: routing, caching, compression,
# security headers, the health check and what the image contains. Needs the stack up: docker compose up -d --build
#   bash docs/evidence/check-web-container.sh [base-url]        (default http://localhost:5173)
set -u
BASE="${1:-http://localhost:5173}"
pass=0; fail=0

check() { # description, then a command (function) that succeeds when the claim is true
  local what="$1"; shift
  if "$@" >/dev/null 2>&1; then pass=$((pass + 1)); echo "ok    $what"; else fail=$((fail + 1)); echo "FAIL  $what"; fi
}

status()  { curl -s -o /dev/null -w '%{http_code}' "$BASE$1"; }
body()    { curl -s "$BASE$1"; }
headers() { curl -s -o /dev/null -D - "$@" | tr -d '\r'; }            # the response headers of a request
is_app()  { [ "$(status "$1")" = 200 ] && body "$1" | grep 'id="root"' >/dev/null; }
returns() { [ "$(status "$1")" = "$2" ]; }
header_has() { headers "$BASE$1" | grep -i -- "$2" >/dev/null; }       # path, then a header line (or part of one)
header_hasnt() { ! headers "$BASE$1" | grep -iE -- "$2" >/dev/null; }
gzipped() { headers -H 'Accept-Encoding: gzip' "$BASE$1" | grep -i '^content-encoding: gzip' >/dev/null; }
page_has() { body / | grep -F -- "$1" >/dev/null; }
page_hasnt() { ! body / | grep -F -- "$1" >/dev/null; }
non_root() { [ "$(docker compose exec -T web id -u | tr -d '\r')" != 0 ]; }
no_node() { [ -z "$(docker compose exec -T web sh -c 'command -v node; ls /app 2>/dev/null')" ]; }
healthy() { docker compose ps web --format '{{.Status}}' | grep healthy >/dev/null; }

asset=$(body / | grep -o '/assets/[^"]*\.js' | head -1)

echo "== routing"
check "/ is the app (has the root element)"                       is_app /
for path in /login /register "/?view=week&date=2026-10-05" /anything/else; do
  check "$path returns the app, not a 404 (reload works)"         is_app "$path"
done
check "a missing file under /assets/ is a real 404"               returns /assets/does-not-exist.js 404
check "/healthz answers 200"                                      returns /healthz 200

echo "== the page"
check "carries a Content-Security-Policy"                         page_has "Content-Security-Policy"
check "...that names the API in connect-src"                      page_has "connect-src &#39;self&#39; http://localhost:"
check "was built for production (a hashed script)"                test -n "$asset"
check "...with no dev client in it"                               page_hasnt "@vite/client"

echo "== caching"
check "index.html is never cached"                                header_has / "cache-control: no-cache"
check "a hashed asset is cached for a year"                       header_has "$asset" "max-age=31536000"

echo "== compression"
check "the script is gzipped when the browser accepts it"         gzipped "$asset"

echo "== security headers (on the page and on an asset)"
for target in / "$asset"; do
  for h in "x-content-type-options: nosniff" "x-frame-options: DENY" "referrer-policy: no-referrer" "content-security-policy: frame-ancestors 'none'"; do
    check "$target has $h"                                        header_has "$target" "$h"
  done
done
check "does not announce the nginx version"                       header_hasnt / '^server: nginx/'

echo "== the image"
check "the container runs as a non-root user"                     non_root
check "there is no Node and no source in the image"               no_node
check "Docker reports the container healthy"                      healthy

echo
echo "$pass passed, $fail failed"
echo "image size: $(docker image ls distraction-tracker-web --format '{{.Size}}')"
[ "$fail" -eq 0 ]
