# Backend functional tests

Run `npm ci`, then `npm test` for all requirement groups or `npm run test:payroll` for FR-12 only.

GitHub Actions: open **Actions > Backend Functional Tests**, open a run, choose **FR-09 to FR-12 backend tests**, and expand each requirement's named step. Capture the individual test names and final pass/fail totals for report evidence. The workflow runs on pull requests to main and on pushes to main or test/fr12-payroll-actions. After the workflow is on the default branch, **Run workflow** supports manual runs.

The FR-12 harness loads the current functions, access middleware and endpoints from server.js into an isolated Express app. It avoids production startup, .env loading and MongoDB connections. In-memory model doubles simulate database queries, inserts and saves. Real payroll calculation functions and PDFKit PDF generation are exercised. These checks do not validate live MongoDB connectivity, indexes or deployed browser behaviour.

Coverage includes Actual/Scheduled/Manual approvals, invalid inputs, Undo, role restrictions, released snapshot persistence, repeated-release protection, prior YTD accumulation, saved-data retrieval, PDF downloads and errors. Duplicate-release checks verify the endpoint's $setOnInsert behaviour against an in-memory store; they do not replace a MongoDB concurrency test.

FR-09, FR-10 and FR-11 compare refactored HTTP behaviour against their saved original-route fixtures. Existing VM-based route tests may print an Express Promise-like handler deprecation warning; it comes from the test VM boundary.

The workflow performs continuous integration tests. It does not deploy the application.
