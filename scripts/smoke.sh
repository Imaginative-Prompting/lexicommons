#!/bin/zsh
# Smoke test against the live site: the gate or the public pages (whichever side of the switch it's on), .app redirect, MCP
# discovery and OAuth metadata. With the gate on, it reads the gate password from the macOS Keychain (internet password, server
# lexicommons.com, account site-gate) and never prints it.
# Exit code 0 only if every check passes.
set -uo pipefail
BASE=${BASE:-https://lexicommons.com}
JAR=$(mktemp -t lexicommons-smoke)
trap 'rm -f "$JAR"' EXIT
fails=0
check() { # name, condition result (0 = pass)
  if [[ $2 == 0 ]]; then print -- "PASS  $1"; else print -- "FAIL  $1  ($3)"; fails=$((fails+1)); fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# Which side of the switch the site is on (src/gate.ts): robots.txt says no to everything only while the gate is on.
robots=$(curl -s "$BASE/robots.txt")
if [[ $robots == $'User-agent: *\nDisallow: /' ]]; then
print -- "The gate is on."
c=$(code "$BASE/"); check "unauthenticated / is gated (303)" $([[ $c == 303 ]]; echo $?) "$c"
loc=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/app/"); check "gate redirect keeps next" $([[ $loc == *"/_gate?next=%2Fapp%2F"* ]]; echo $?) "$loc"
c=$(code -X POST --data-urlencode "password=wrong-password" "$BASE/_gate"); check "wrong password refused (401)" $([[ $c == 401 ]]; echo $?) "$c"
PW=$(security find-internet-password -s lexicommons.com -a site-gate -w)
c=$(printf %s "$PW" | curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -X POST --data-urlencode "password@-" --data-urlencode "next=/" "$BASE/_gate")
unset PW
check "right password accepted (303 + cookie)" $([[ $c == 303 ]] && grep -q lc_gate "$JAR"; echo $?) "$c"
c=$(code -b "$JAR" "$BASE/"); check "cover page with gate cookie (200)" $([[ $c == 200 ]]; echo $?) "$c"
loc=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -b "$JAR" "$BASE/app/"); check "app signed out goes to sign-in (302)" $([[ $loc == "302 $BASE/login?next=/app/" ]]; echo $?) "$loc"
c2=$(code -b "$JAR" "$BASE/js/shell/main.js"); check "app code served behind the gate (200)" $([[ $c2 == 200 ]]; echo $?) "$c2"
c=$(code -b "$JAR" "$BASE/api/me"); check "/api/me without a session (401)" $([[ $c == 401 ]]; echo $?) "$c"
csp=$(curl -s -D - -o /dev/null -b "$JAR" "$BASE/login" | grep -i '^content-security-policy'); check "sign-in page sends a CSP" $([[ -n $csp ]]; echo $?) "none"
csp=$(curl -s -D - -o /dev/null -b "$JAR" "$BASE/design/" | grep -i '^content-security-policy'); check "design page sends a CSP" $([[ -n $csp ]]; echo $?) "none"
else
print -- "The gate is off."
hdr=$(curl -s -D - -o /dev/null "$BASE/"); check "the home page is open (200)" $([[ $hdr == *" 200"* ]]; echo $?) "$(head -1 <<<"$hdr")"
check "the home page may be indexed" $([[ $hdr != *[Xx]-[Rr]obots-[Tt]ag* ]]; echo $?) "$(grep -i x-robots <<<"$hdr")"
for page in /privacy /terms; do
  hdr=$(curl -s -D - -o /dev/null "$BASE$page"); check "$page is open and may be indexed" $([[ $hdr == *" 200"* && $hdr != *[Xx]-[Rr]obots-[Tt]ag* ]]; echo $?) "$(head -1 <<<"$hdr")"
done
check "robots.txt asks crawlers off what's private" $([[ $robots == *"Disallow: /app/"* && $robots == *"Disallow: /api/"* && $robots != *$'Disallow: /\n'* ]]; echo $?) "$robots"
home=$(curl -s "$BASE/")
check "the share card is named" $([[ $home == *'property="og:image" content="https://lexicommons.com/icons/share-card.png"'* ]]; echo $?) "no og:image"
c=$(code -A Twitterbot/1.0 "$BASE/icons/share-card.png"); check "a card fetcher gets the card (200)" $([[ $c == 200 ]]; echo $?) "$c"
check "the cookie table has no gate cookie" $([[ "$(curl -s "$BASE/privacy")" != *lc_gate* ]]; echo $?) "lc_gate"
loc=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$BASE/app/"); check "app signed out goes to sign-in (302)" $([[ $loc == "302 $BASE/login?next=/app/" ]]; echo $?) "$loc"
hdr=$(curl -s -D - -o /dev/null "$BASE/login"); check "sign-in stays out of search, with a CSP" $([[ $hdr == *noindex* && $hdr == *[Cc]ontent-[Ss]ecurity-[Pp]olicy* ]]; echo $?) "$(grep -i x-robots <<<"$hdr")"
c=$(code "$BASE/api/me"); check "/api/me without a session (401)" $([[ $c == 401 ]]; echo $?) "$c"
c=$(code "$BASE/api/community/explore"); check "Explore without a session (401)" $([[ $c == 401 ]]; echo $?) "$c"
c=$(code "$BASE/_gate"); check "the gate's page is gone" $([[ $c != 200 ]]; echo $?) "$c"
fi

loc=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "https://lexicommons.app/app/?x=1"); check ".app redirects to .com (301)" $([[ $loc == "301 https://lexicommons.com/app/?x=1" ]]; echo $?) "$loc"

hdr=$(curl -s -D - -o /dev/null -X POST -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}' "$BASE/mcp")
check "/mcp without a token: 401" $([[ $hdr == *" 401"* ]]; echo $?) "$(head -1 <<<"$hdr")"
# The server names the origin it's served from: BASE (lexicommons.com live; a local copy's own address in a rehearsal).
check "/mcp 401 points at resource metadata" $([[ $hdr == *"resource_metadata=\"$BASE/.well-known/oauth-protected-resource/mcp\""* ]]; echo $?) "$(grep -i www-authenticate <<<"$hdr")"

prm=$(curl -s "$BASE/.well-known/oauth-protected-resource/mcp")
check "protected resource metadata names /mcp" $(BASE=$BASE python3 -c 'import json,os,sys; b=os.environ["BASE"]; d=json.load(sys.stdin); sys.exit(0 if d["resource"]==b+"/mcp" and d["authorization_servers"][0]==b else 1)' <<<"$prm"; echo $?) "$prm"
asm=$(curl -s "$BASE/.well-known/oauth-authorization-server")
check "AS metadata: CIMD + public clients + S256 + iss + DCR" $(python3 -c '
import json,sys; d=json.load(sys.stdin)
ok = d.get("client_id_metadata_document_supported") is True and "none" in d.get("token_endpoint_auth_methods_supported",[]) \
  and "S256" in d.get("code_challenge_methods_supported",[]) and d.get("authorization_response_iss_parameter_supported") is True \
  and d.get("registration_endpoint","").endswith("/register")
sys.exit(0 if ok else 1)' <<<"$asm"; echo $?) "$asm"

c=$(code "$BASE/api/v1/whoami"); check "REST without a token (401)" $([[ $c == 401 ]]; echo $?) "$c"
c=$(code -X PUT --data x "$BASE/upload/nope?exp=1&sig=x"); check "upload with a bad signature refused (403)" $([[ $c == 403 ]]; echo $?) "$c"

print -- "\n$fails failed"
exit $(( fails > 0 ))
