# Calendar-based Work Scheduling Web Application

JobFlow is a mobile-first web application for small trade businesses.
It supports job scheduling, Worker allocation, job completion,
timesheet approval and payslip management.

## Live Demo

https://test-aunk.onrender.com/login/login.html

## Demo Login Accounts

Use these accounts to test Owner and Worker access.

### Owner Account

- **Email:** `owner@jobflow.com`
- **Password:** `owner123`
- **Redirect:** `/owner-view/owner-view.html`

### Worker Accounts

| Worker | Email | Password |
|---|---|---|
| Sarah Johnson | `sarah@jobflow.com` | `Worker123` |
| Mike Lee | `mike@jobflow.com` | `Worker123` |
| Emma Brown | `emma@jobflow.com` | `Worker123` |
| James Wilson | `james@jobflow.com` | `Worker123` |

Workers are redirected to `/worker-view/worker-view.html` after login.

These accounts are for demonstration and testing only.

## Main Features

### Owner Features

#### Features Completed in Assignment 1

##### 1. Calendar and Job Scheduling

- View scheduled jobs in a two-week calendar.
- Select a date to view its jobs.
- Identify Pending, Accepted, Declined and Finished jobs through coloured status indicators.
- Create jobs with task details, scheduled times, location and client information.

##### 2. Worker Allocation

- Assign existing Workers to jobs.
- View Workers' responses to job offers.
- Reassign jobs when required.

#### Features Added After Assignment 1

##### 3. Worker Account Management

- Add Workers with a name, email address, phone number and temporary password.
- Activate or deactivate Worker accounts.
- Configure Worker hourly rates.

##### 4. Timesheet Review and Approval

- Review submitted jobs, completion notes and photos.
- Review recorded clock-in and clock-out times.
- Approve start and end times independently using Actual, Scheduled or Manual values.
- Record approved hours and the hourly rate used for payroll.
- Undo approval to return a timesheet to pending approval.

Actual uses a recorded punch, Scheduled uses the job's scheduled time,
and Manual allows the Owner to enter a time.

Undoing approval does not change a payslip that has already been released.

##### 5. Payroll and Payslips

- Review approved weekly hours and payroll estimates.
- View gross pay, estimated tax, superannuation, net pay and year-to-date (YTD) totals.
- Select Generate Payslips, followed by Confirm & Push, to release payslips to Workers.
- Save each Worker's pay-period details in MongoDB when pushed.
- Keep released payslip details unchanged when job records or hourly rates change.

Each Worker can receive one payslip per week. Pushing the same week
again does not replace the existing payslip. Payslips are shared
through the app, not by email.

Pay is calculated from approved hours and hourly rates.
Superannuation is calculated at 12%. Tax is an estimate and excludes
the Medicare levy, offsets and other deductions. YTD totals cover
the financial year starting on 1 July.

##### 6. Profile and Account

- Update the signed-in Owner's profile details.
- Change the account password using the current password and a new password.

### Worker Features

#### Features Completed in Assignment 1

##### 1. Calendar and Assigned Jobs

- View assigned jobs in a two-week calendar.
- Select a date to view its assigned jobs.
- View task details, scheduled times, location and client contact information.

##### 2. Job Offer Responses

- Accept pending job offers.
- Decline pending job offers.

##### 3. Time Recording and Job Completion

- Clock in and out on accepted jobs when available.
- Submit completed jobs.
- Add optional completion notes.
- Upload optional completion photos.

Clock records, notes and photos are optional when submitting a completed job.
Submission changes the job status to Finished.

#### Features Added After Assignment 1

##### 4. Timesheet Approval Information

- View whether a completed job is awaiting approval or has been approved.
- View approved working-time information for completed jobs.

##### 5. Payslips

- View payslips released by the Owner.
- Review pay-period details, daily hours and YTD totals.
- Download payslips as PDFs generated from saved pay-period records.
- Access only the signed-in Worker's own payslips.

##### 6. Profile and Account

- Update the signed-in Worker's profile details.
- Change the account password using the current password and a new password.

### Improvements to Existing Features

#### 1. Persistent Photo Storage

- Store completion photos in MongoDB GridFS.
- Keep photos available after application redeployment.
- Allow active Owners and the assigned active Worker to access photos.
- Support up to 10 JPG, PNG or WebP photos per submission, with a maximum size of 5 MB each.

#### 2. Reliable Completion Submission

- Prevent repeated submissions from overwriting completed-job information.
- Attempt to remove uploaded photos when submission fails.

#### 3. Shared Interface Styling

- Use a shared global stylesheet for common interface rules.
- Apply consistent alignment to calendar dates and avatar initials across pages.

## Setup and Deployment

Choose one of the following methods to run the application.

All methods require a MongoDB database containing the application
accounts. Account-seeding scripts are not included in this repository.

### Option 1: Render Deployment

1. Push the project to GitHub.

2. Sign in to Render and select **New → Web Service**.

3. Connect GitHub and select the project repository.

4. Configure the service:

   | Setting | Value |
   |---|---|
   | Runtime | Node |
   | Branch | main |
   | Root Directory | Leave blank |
   | Build Command | npm install |
   | Start Command | node server.js |

5. Add these environment variables:

   | Key | Value |
   |---|---|
   | MONGODB_URI | Your MongoDB Atlas connection string |
   | SESSION_SECRET | A long, private random secret |
   | NODE_ENV | production |

6. Add the service's outbound IP addresses or ranges from
   **Render → Connect → Outbound** to the MongoDB Atlas
   **Network Access** list.

7. Select **Deploy Web Service** and wait for deployment to complete.

8. Open the Render URL followed by `/login/login.html`.

### Option 2: AWS EC2 Deployment

This method describes a simple HTTP demonstration deployment.

1. Launch an Ubuntu EC2 instance with a public IP address and an SSH key pair.

2. Configure its security group:

   | Port | Purpose | Source |
   |---|---|---|
   | 22 | SSH | Your IP address |
   | 3000 | Application | The IP addresses allowed to access the demo |

3. Connect using SSH:

   ```bash
   chmod 400 your-key.pem
   ssh -i your-key.pem ubuntu@your-ec2-public-ip
   ```

4. Install Git and a supported Node.js LTS version, including npm.

5. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/Krisy-uni/assignment2-IFN636.git
   cd assignment2-IFN636
   npm install
   ```

6. Create a `.env` file in the project root:

   ```env
   MONGODB_URI=your-mongodb-connection-string
   SESSION_SECRET=your-private-random-session-secret
   NODE_ENV=development
   ```

   Use this configuration for the HTTP demonstration.
   For production, configure HTTPS and use `NODE_ENV=production`.

7. Add the EC2 public IP address to MongoDB Atlas's
   **Network Access** list.

8. Start the application:

   ```bash
   node server.js
   ```

9. Open:

   ```text
   http://your-ec2-public-ip:3000/login/login.html
   ```

The server runs while the terminal process remains active.
For continuous hosting, configure a process manager or system service.

### Option 3: Local Setup

Node.js, npm and Git must be installed.

1. Clone the repository and open the project folder:

   ```bash
   git clone https://github.com/Krisy-uni/test.git
   cd test
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root:

   ```env
   MONGODB_URI=your-mongodb-connection-string
   SESSION_SECRET=your-private-random-session-secret
   NODE_ENV=development
   ```

4. In MongoDB Atlas, allow your computer's IP address under
   **Network Access**.

5. Start the server:

   ```bash
   node server.js
   ```

6. Open http://localhost:3000/login/login.html and sign in using a demo account.

Opening an HTML file directly does not provide the backend API
or login-session functionality.

Do not commit your `.env` file or private credentials to GitHub.

## Data Storage

MongoDB stores accounts, jobs and released payslip details.
Completion photos are stored in MongoDB GridFS.

When a Worker downloads a payslip, the backend creates a PDF from
the saved pay-period details.

Photos and released payslip records remain available after
application redeployment. They do not depend on local files
on the hosting server.

Users may need to sign in again after a server restart because
login sessions are stored in memory.

## Known Limitations

- Email-based password recovery is not currently available.
- Login sessions are not preserved across server restarts.
- Released payslips cannot be corrected or replaced through the app.
- Changes to historical job records may affect YTD totals in future payslips. Already released payslips remain unchanged.
- Payroll figures are estimates.
- The application is a prototype and requires further work on security, backups, session storage and payroll accuracy before real business use.
