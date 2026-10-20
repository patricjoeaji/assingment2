#!/usr/bin/env bash
# Run as ubuntu on the EC2 deployment runner, after CI succeeds.
set -Eeuo pipefail

: "${DEPLOY_SHA:?DEPLOY_SHA must identify the commit that passed CI}"
APP_DIR="${APP_DIR:-/home/ubuntu/assignment2-IFN636}"
APP_NAME="${APP_NAME:-assignment2}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/login/login.html}"

[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA'; exit 1; }
for command_name in git npm node pm2 curl flock; do
  command -v "$command_name" >/dev/null
done
cd "$APP_DIR"
exec 9>"$(git rev-parse --git-dir)/jobflow-deploy.lock"
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
[[ -s .env ]] || { echo 'Missing EC2 .env configuration'; exit 1; }
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo 'Refusing deployment: .env must not be tracked in Git'
  exit 1
fi
git diff --quiet || { echo 'Uncommitted tracked changes: deployment stopped'; exit 1; }
git diff --cached --quiet || { echo 'Staged changes: deployment stopped'; exit 1; }
pm2 describe "$APP_NAME" >/dev/null

git fetch --no-tags origin main
git cat-file -e "${DEPLOY_SHA}^{commit}"
git merge-base --is-ancestor "$DEPLOY_SHA" origin/main || {
  echo 'The requested commit is not on origin/main'; exit 1;
}
previous_sha=$(git rev-parse HEAD)
git merge-base --is-ancestor "$previous_sha" "$DEPLOY_SHA" || {
  echo 'Refusing an older or divergent deployment'; exit 1;
}
if git cat-file -e "${DEPLOY_SHA}:.env" 2>/dev/null; then
  echo 'Refusing deployment: target commit contains .env'; exit 1
fi

check_page() {
  local attempt http_code
  for attempt in {1..10}; do
    http_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$HEALTH_URL") || http_code=000
    if [[ "$http_code" == 200 ]]; then return 0; fi
    sleep 2
  done
  return 1
}

rollback() {
  local failure_code=$?
  trap - ERR
  echo "Deployment failed; restoring commit $previous_sha"
  if git checkout --detach "$previous_sha" && npm ci && pm2 restart "$APP_NAME" --update-env && check_page; then
    echo 'Previous version restored; deployment still marked failed'
  else
    echo 'Automatic recovery failed; inspect the EC2 process and logs'
  fi
  exit "$failure_code"
}
trap rollback ERR

# Detached HEAD deploys exactly the tested commit, not a newer main commit.
# Git leaves the untracked EC2 .env intact; no git clean or reset is used.
git checkout --detach "$DEPLOY_SHA"
npm ci
node --check server.js
pm2 restart "$APP_NAME" --update-env
check_page
pm2 save
trap - ERR
echo "Deployed commit $(git rev-parse HEAD)"
echo "Login page check passed: $HEALTH_URL"
pm2 list
