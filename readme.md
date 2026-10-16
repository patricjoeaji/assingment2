
# Calendar-based Work Scheduling Web Application

## Demo Login Accounts

The following demo accounts can be used to test role-based access.

### Owner Account

- **Email:** `owner@jobflow.com`
- **Password:** `Owner123`
- **Redirect:** `/owner-view/owner-view.html`

### Worker Accounts

| Worker | Email | Password |
|---|---|---|
| Sarah Johnson | `sarah@jobflow.com` | `Worker123` |
| Mike Lee | `mike@jobflow.com` | `Worker123` |
| Emma Brown | `emma@jobflow.com` | `Worker123` |
| James Wilson | `james@jobflow.com` | `Worker123` |

All Worker accounts are redirected to `/worker-view/worker-view.html` after successful login.



A mobile-first web application designed to support job scheduling, allocation and worker management for small trade businesses.

## Setup

1. Install the dependencies with `npm install`.
2. Configure `MONGODB_URI` in `.env` and make sure MongoDB is available.
3. Run `node seed-users.js` to create the demo accounts.
4. Optionally run `node seed.js` to add demo jobs. This deletes **all existing jobs** in the configured database first; use only with a fresh or disposable database.
5. Start the server with `node server.js` and open `http://localhost:3000/login/login.html`.

The app uses the Express server and MongoDB; opening an HTML file directly will not provide its API or session functionality.

## Email Configuration

Forgot-password reset links are emailed and require an SMTP account. Changing a password while signed in from **My Profile** does not use email. Payslips are pushed to the Worker app and are not emailed. Configure these variables in `.env` to enable reset emails:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=JobFlow <no-reply@example.com>
APP_URL=http://localhost:3000
SESSION_SECRET=replace-with-a-long-random-secret
```

Reset links expire after 30 minutes and can only be used once. In production, set `APP_URL` to the deployed application URL and use an SMTP provider with TLS enabled.

Forgot-password reset links expire after 30 minutes and can only be used once. On the Payroll page, **Generate Payslips** followed by **Confirm & Push** publishes each eligible worker's payslip in the Worker app's **Pay Slip** view, where it can be viewed and downloaded. No payslip email is sent. Workers need approved hours and a configured hourly rate. Payslips use [ATO Australian resident income-tax brackets](https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents) for the pay period's financial year, annualising weekly pay across 52 weeks. For 2026–27, income up to `$18,200` is tax-free and the next bracket is 15%. The estimate excludes the Medicare levy, offsets, and other deductions.

YTD totals accumulate approved weekly payroll amounts from 1 July. The hourly rate is snapshotted when hours are approved; older approved jobs without a snapshot use the worker's currently configured rate.

Worker management endpoints require an owner session established by sign-in. Configure a stable, private `SESSION_SECRET` in deployed environments and use a persistent session store for production; the default in-memory store is for local development only.

## Worker Management Pages

- `workers/workers.html` lists all workers and lets an Owner activate or deactivate accounts.
- `workers/add-worker.html` is the separate Add Worker form. Name, email, phone, and a temporary password are required.
- The Owner dashboard's **Workers** navigation opens the workers list; successful creation returns there.
- **My Profile** is available to both roles at `my-account/my-account.html`. Signed-in users can change their password by entering their current password and a new password.

## Timesheet Approval

- Workers may clock in/out on accepted jobs, but clocking is optional. **Submit completed job** can be used without punches, a note, or photos; submission changes the job status to `Finished` and sends it for Owner approval. Workers may optionally include a note and up to five JPG, PNG, or WebP photos.
- Owners open `time-sheet/timesheets.html` from the Owner dashboard's **Timesheets** navigation to review every assigned job in the selected Monday-to-Sunday week.
- Clock In and Clock Out are approved independently. The Owner can choose Actual, Scheduled, or Manual for each. Actual is the default when a punch exists; when there is no punch, the Owner enters the time manually. Until approval, both the Owner and assigned Worker see `Pending approval`.
- Select a job title or **View task details** to open `completed job/completed-job.html`, which shows the client, Worker, scheduled and actual punches, approved times, total, completion note, and photos. Owners and the assigned Worker can view the Finished job.
- Approval records store the selected time sources, approval timestamp, and Owner account. Completion photos are stored outside the public web root in `.private-uploads/jobs`; production deployments need persistent private file storage.

## Architecture Summary

The application uses HTML, CSS, client-side JavaScript, an Express API, and MongoDB for persistent users and jobs. Sessions use Express's in-memory store by default, which is suitable only for local development.

## Known Limitations

This is a prototype and may not include every function shown in the Figma design. Production use requires a persistent session store, secure environment configuration, SMTP for forgot-password emails, and persistent private storage for completion photos and generated payslip PDFs.

## Deployment

Deployment URL: http://13.211.204.157/login/login.html
