# GitHub Actions deployment to EC2

## CI

`.github/workflows/backend-functional-tests.yml` runs FR-09 to FR-12 tests on GitHub-hosted Ubuntu. Pull requests only run CI. Main pushes and manual runs on main run CI before CD.

## CD

The `CD - Deploy to EC2` job uses `needs: backend-tests` and runs only for this repository's main push or manual main run. It targets a Linux x64 self-hosted runner labelled `jobflow-deploy`.

Current deployment settings:
- Application: `/home/ubuntu/assignment2-IFN636`
- PM2 application name: `assignment2`, owned by `ubuntu`
- PM2 directory: `/home/ubuntu/.pm2`
- Login-page check: `http://127.0.0.1:3000/login/login.html`
- Public browser URL, while this IP remains assigned: `http://3.25.86.156:3000/login/login.html`

Run the runner service as ubuntu. Node, npm, PM2, Git, curl and flock must be on the service PATH. The application must already have its private untracked `.env` and be registered in PM2. GitHub does not need the MongoDB password, AWS keys or an SSH key for this deployment method. EC2 must be able to reach GitHub and MongoDB.

The script fetches main and deploys exactly the commit that passed CI. It refuses tracked local edits, commits outside main, backward/divergent updates and a tracked `.env`. The EC2 checkout intentionally uses a detached HEAD; future updates are handled by the deployment script. No `git clean` or `git reset` is used.

It installs dependencies, checks server.js syntax, restarts PM2 and checks for HTTP 200 at the login page. If an operation fails after checkout, it attempts to restore the previous commit, reinstall dependencies and restart the previous version. Recovery can also fail, so inspect the logs if either step reports failure. A failed deployment remains red even if recovery succeeds. Restarts briefly interrupt the app and clear its in-memory login sessions.

The HTTP check confirms the login page responds, not database readiness or a complete user journey. Check Owner and Worker login/data access in the browser after the first deployment.

## First deployment

1. Confirm the runner service is active and GitHub Settings > Actions > Runners shows it Idle.
2. Merge the CI/CD pull request into main.
3. Open Actions > Backend CI and EC2 CD. The backend test job must turn green before the EC2 job starts.
4. Open the deployment job and confirm the deployed commit and login-page check passed.
5. Verify Owner and Worker login in the browser. Keep PM2 status and Actions-step screenshots for the report.

## Runner access

This persistent runner shares the application host and can access its files. Keep all PR test jobs on GitHub-hosted runners; never approve or add a workflow that runs untrusted PR code on this host. The main-only condition protects this workflow; it does not restrict other workflows someone with repository write access could add. Limit repository write access to trusted maintainers and review workflow changes.

## Scope

This config deploys one EC2 instance. It does not configure an ALB, a second instance, HTTPS, shared sessions or load testing.
