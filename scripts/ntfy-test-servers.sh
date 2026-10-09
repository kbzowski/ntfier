#!/usr/bin/env bash
# Starts the ntfy servers the integration tests run against:
#   current (v2.29, auth enabled) on :8080, old (v2.16, no config) on :8081.
# Then: NTFY_TEST_URL=http://localhost:8080 NTFY_TEST_OLD_URL=http://localhost:8081 cargo test
# Stop with: scripts/ntfy-test-servers.sh stop
set -euo pipefail

if [ "${1:-}" = "stop" ]; then
	docker rm -f ntfier-test-ntfy ntfier-test-ntfy-old >/dev/null 2>&1 || true
	exit 0
fi

docker rm -f ntfier-test-ntfy ntfier-test-ntfy-old >/dev/null 2>&1 || true

# User "tester" / password "testpass" (bcrypt hash from `ntfy user hash`), plus one token.
# Anonymous visitors can only read; "locked" is denied to everyone.
docker run -d --name ntfier-test-ntfy -p 8080:80 \
	-e NTFY_BASE_URL=http://localhost:8080 \
	-e NTFY_AUTH_FILE=/tmp/user.db \
	-e NTFY_AUTH_DEFAULT_ACCESS=read-only \
	-e 'NTFY_AUTH_USERS=tester:$2a$10$8j5DaWPx/3vTcJfAnFz.s./fDD3mQoS7fAFxEd7prRg9iYe8OkXta:user' \
	-e NTFY_AUTH_TOKENS=tester:tk_ntfiertestaccesstoken00000001 \
	-e 'NTFY_AUTH_ACCESS=tester:*:read-write,tester:locked:deny-all,*:locked:deny-all' \
	-e NTFY_ENABLE_LOGIN=true \
	-e NTFY_ATTACHMENT_CACHE_DIR=/tmp/attachments \
	-e NTFY_MESSAGE_SIZE_LIMIT=4k \
	-e NTFY_VISITOR_REQUEST_LIMIT_BURST=10000 \
	binwiederhier/ntfy:v2.29.0 serve >/dev/null

docker run -d --name ntfier-test-ntfy-old -p 8081:80 binwiederhier/ntfy:v2.16.0 serve >/dev/null

for port in 8080 8081; do
	for _ in $(seq 1 30); do
		curl -sf "http://localhost:$port/v1/health" >/dev/null && break
		sleep 1
	done
	curl -sf "http://localhost:$port/v1/health" >/dev/null || { echo "ntfy on :$port did not start" >&2; exit 1; }
done
echo "ntfy test servers up on :8080 (v2.29) and :8081 (v2.16)"
