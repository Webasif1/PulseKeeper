You are a senior full-stack software engineer, MERN architect, UI/UX designer, and DevOps engineer.

I want you to DESIGN AND DEVELOP a complete, production-quality web application called:

# SITE HEALTH MONITOR

The application is a developer-focused website monitoring and health dashboard.

The main problem it solves:

I have multiple projects deployed on free-tier hosting platforms such as Render, Railway, etc. Some free-tier services can become inactive or sleep after periods of inactivity. I want a centralized dashboard where I can add my projects, monitor their availability, periodically send legitimate health-check requests, track uptime and response time, detect outages, and view analytics.

This should NOT look like a basic CRUD/admin dashboard.

Build it like a polished SaaS/developer monitoring product that could actually be deployed and used.

==================================================
1. REQUIRED TECH STACK — MUST USE MERN
==================================================

The application MUST use the MERN stack.

Frontend:
- React.js
- TypeScript
- Vite
- React Hooks
- React Router
- Tailwind CSS
- Recharts
- Lucide React
- Axios

Backend:
- Node.js
- Express.js
- TypeScript
- REST API
- Mongoose

Database:
- MongoDB
- MongoDB Atlas for production

Authentication:
- JWT
- bcrypt
- HTTP-only cookies where appropriate

Monitoring:
- Node.js monitoring service
- Axios or native fetch
- Configurable health-check intervals
- Request timeout handling
- Response-time measurement
- HTTP status monitoring

Scheduling:
- node-cron for the continuously running backend
- The architecture should also allow an external cron service to trigger the monitoring API if necessary

Deployment:
- React frontend → Vercel
- Node.js + Express backend → Render / Railway / VPS / other always-on Node-compatible hosting
- MongoDB → MongoDB Atlas

IMPORTANT:

DO NOT use:
- Next.js
- Supabase
- Firebase
- PostgreSQL
- Prisma
- Laravel
- Django

This must remain a MERN application.

Architecture:

React
↓
Express.js REST API
↓
Node.js
↓
Mongoose
↓
MongoDB Atlas

==================================================
2. PRODUCT GOAL
==================================================

The dashboard should allow me to:

- Add multiple websites/projects
- Edit monitored websites
- Delete monitored websites
- Enable/disable monitoring
- Manually check a website
- Automatically monitor websites
- Measure response time
- Detect Online / Slow / Offline states
- Track uptime
- Track downtime
- Track historical health checks
- View response-time trends
- View uptime analytics
- Detect incidents
- Track incident duration
- Receive notifications
- Search/filter/sort websites
- Configure monitoring intervals
- Configure timeout thresholds
- Configure failure thresholds
- View detailed analytics for every website

==================================================
3. IMPORTANT MONITORING ARCHITECTURE
==================================================

DO NOT rely only on browser-based setInterval() monitoring.

A browser tab can be:
- Closed
- Suspended
- Throttled
- Disconnected
- Put into background mode

Therefore the actual monitoring must happen on the Node.js backend.

Architecture:

                    ┌──────────────────────┐
                    │    React Dashboard    │
                    │       Vercel         │
                    └──────────┬───────────┘
                               │
                               ↓
                    ┌──────────────────────┐
                    │ Express REST API     │
                    │      Node.js         │
                    └──────────┬───────────┘
                               │
                  ┌────────────┴─────────────┐
                  ↓                          ↓
        ┌─────────────────┐        ┌──────────────────┐
        │ MongoDB Atlas   │        │ Monitoring       │
        │                 │        │ Service          │
        └─────────────────┘        └────────┬─────────┘
                                            │
                                            ↓
                                   Monitored Websites

The backend monitoring service should:

1. Load active websites from MongoDB.
2. Determine which sites need checking.
3. Send health-check requests.
4. Measure response time.
5. Determine website status.
6. Save the health-check result.
7. Update current website status.
8. Detect incidents.
9. Resolve incidents when the site recovers.
10. Trigger notifications when configured.

Use node-cron for scheduled checks.

Example:

Every 5 minutes
↓
node-cron
↓
Load enabled websites
↓
Health-check websites
↓
Save results
↓
Update status
↓
Create/resolve incidents

==================================================
4. HOSTING / KEEP-ALIVE REALITY
==================================================

Be technically accurate.

The application can send periodic HTTP health checks, but it must NOT claim that this guarantees a hosting provider will never suspend or sleep a free-tier service.

Hosting providers can:
- Change their policies
- Rate-limit requests
- Restrict artificial traffic
- Suspend services for inactivity
- Have different free-tier rules

The application should be positioned primarily as a:

"Website Health Monitoring & Uptime Tracking Platform"

with a secondary:

"Keep-Alive Health Check"

feature.

Users should be encouraged to comply with their hosting provider's acceptable-use policies.

==================================================
5. WEBSITE MANAGEMENT
==================================================

Create complete CRUD functionality.

Users should be able to:

ADD WEBSITE

Fields:

- Website Name
- Website URL
- Health Check URL
- Description
- Tags
- Monitoring Enabled
- Monitoring Interval
- Timeout
- Slow Response Threshold
- Failure Threshold

Example:

Name:
Recallix

URL:
https://recallix.onrender.com

Health Check URL:
https://recallix.onrender.com/api/health

Monitoring Interval:
5 minutes

Timeout:
10 seconds

Slow Threshold:
3000 ms

Failure Threshold:
3

Enabled:
Yes

EDIT WEBSITE

Allow every field to be edited.

DELETE WEBSITE

Require confirmation before deletion.

PAUSE WEBSITE

Allow monitoring to be temporarily disabled without deleting the website.

CHECK NOW

Allow a manual health check.

==================================================
6. URL VALIDATION
==================================================

Validate URLs before saving.

Only allow appropriate HTTP/HTTPS URLs.

Prevent:
- Invalid URLs
- Dangerous protocols
- localhost
- 127.0.0.1
- Private IP addresses
- Internal network addresses
- Cloud metadata endpoints
- Link-local addresses

The backend MUST validate URLs independently of the frontend.

==================================================
7. SSRF PROTECTION
==================================================

This is extremely important.

The health-check endpoint accepts external URLs, so the backend could potentially become an SSRF proxy.

Implement SSRF protection.

Do not blindly allow the server to request arbitrary internal resources.

Block:
- localhost
- 127.0.0.0/8
- 10.0.0.0/8
- 172.16.0.0/12
- 192.168.0.0/16
- 169.254.0.0/16
- ::1
- private IPv6 ranges
- cloud metadata endpoints
- internal hostnames

Validate DNS resolution where appropriate.

Do not rely only on frontend validation.

==================================================
8. HEALTH STATUS
==================================================

Each website should have one of these statuses:

ONLINE
SLOW
OFFLINE
CHECKING
PAUSED
UNKNOWN

Suggested logic:

ONLINE:
Successful HTTP response under slow threshold.

SLOW:
Successful HTTP response but response time exceeds slow threshold.

OFFLINE:
- Request timeout
- DNS failure
- Connection failure
- Network failure
- Unhealthy HTTP response according to configured rules

CHECKING:
Health check currently running.

PAUSED:
Monitoring disabled.

UNKNOWN:
No health-check data yet.

Make thresholds configurable rather than hard-coding them throughout the application.

==================================================
9. HEALTH CHECK DATA
==================================================

Store detailed health-check information.

Example:

{
  "siteId": "...",
  "timestamp": "...",
  "statusCode": 200,
  "responseTime": 382,
  "success": true,
  "errorType": null,
  "errorMessage": null
}

Failure example:

{
  "siteId": "...",
  "timestamp": "...",
  "success": false,
  "statusCode": null,
  "responseTime": null,
  "errorType": "TIMEOUT",
  "errorMessage": "Request timed out"
}

Possible error types:

- TIMEOUT
- DNS_ERROR
- CONNECTION_ERROR
- HTTP_ERROR
- SERVER_ERROR
- UNKNOWN

==================================================
10. DASHBOARD
==================================================

Create a premium dashboard.

Top greeting:

"Good evening, Developer 👋"

Subtitle:

"Here's the health of your monitored services."

Stats cards:

- Total Websites
- Online
- Slow
- Offline
- Average Response Time
- Overall Uptime

Example:

12
Websites

9
Online

2
Slow

1
Offline

438ms
Avg Response

99.87%
Uptime

Then show:

- Website Health
- Recent Incidents
- Response Time Analytics
- Uptime Overview
- Recent Health Checks

==================================================
11. WEBSITE MONITORING CARD
==================================================

Each website should have a polished card or table row.

Display:

- Status indicator
- Website/project name
- URL
- Current status
- Response time
- HTTP status
- Last checked
- Uptime
- Monitoring interval
- Monitoring state

Actions:

- Check Now
- View Details
- Edit
- Pause/Resume
- Delete

Example:

● ONLINE

Recallix
https://recallix.onrender.com

382 ms
HTTP 200

Uptime
99.92%

Last checked
32 seconds ago

==================================================
12. WEBSITE DETAILS PAGE
==================================================

Create a dedicated route:

/sites/:id

The page should contain:

Header:
- Website name
- Status
- URL
- Check Now
- Edit
- Pause/Resume

Statistics:

- Current response time
- Average response time
- Minimum response time
- Maximum response time
- Uptime
- Downtime
- Total checks
- Failed checks

Charts:

1. Response Time
2. Uptime
3. Health Timeline
4. HTTP Status Distribution

Time filters:

- Last 1 hour
- Last 24 hours
- Last 7 days
- Last 30 days
- Last 90 days

==================================================
13. RESPONSE TIME CHART
==================================================

Use Recharts.

Create a polished line chart.

X-axis:
Time

Y-axis:
Response time (ms)

Show:
- Tooltip
- Date/time
- Response time
- Average line if useful

Handle:
- Empty data
- Loading state
- Large datasets
- Responsive layout

==================================================
14. UPTIME ANALYTICS
==================================================

Calculate uptime using historical health checks.

Formula:

uptime =
successful checks / total checks × 100

Show:

24 hours
7 days
30 days
90 days

Example:

99.99%
Last 24h

99.92%
Last 7d

99.87%
Last 30d

Do NOT calculate uptime only from the current status.

==================================================
15. HEALTH TIMELINE
==================================================

Create a visual health timeline.

Example:

🟢 🟢 🟢 🟢 🟢 🟡 🟢 🟢 🔴 🔴 🟢

Each segment represents a health check.

Allow hover to show:

- Timestamp
- Status
- Response time
- HTTP status
- Error

==================================================
16. INCIDENT MANAGEMENT
==================================================

Create an incident system.

When a website repeatedly fails:

Create an incident.

Example:

🔴 Website Down

Recallix

Started:
Aug 7, 2026 — 02:14 AM

Resolved:
Aug 7, 2026 — 02:19 AM

Duration:
5 minutes

Track:

- Website
- Status
- Reason
- Start time
- Recovery time
- Duration

IMPORTANT:

Do not create a new incident for every failed request.

Use consecutive failures.

Example:

Failure threshold:
3

Only declare the website officially offline after 3 consecutive failures.

When the website recovers:

- Resolve incident
- Record recovery timestamp
- Calculate downtime

==================================================
17. INCIDENT PAGE
==================================================

Create:

/incidents

Show:

- Active incidents
- Resolved incidents
- Website
- Reason
- Started
- Resolved
- Duration

Filters:

- Active
- Resolved
- All

==================================================
18. NOTIFICATIONS
==================================================

Add an in-app notification system.

Notify when:

- Website goes offline
- Website recovers
- Website becomes slow
- Incident is created
- Incident is resolved

Show notification badge in the header.

Create a notification panel.

Architecture should be extendable to:

- Email
- Slack
- Discord
- Telegram
- Webhooks

==================================================
19. SEARCH / FILTER / SORT
==================================================

Dashboard must include search.

Search by:

- Website name
- URL
- Tags

Filters:

- All
- Online
- Slow
- Offline
- Paused

Sorting:

- Name
- Status
- Response time
- Uptime
- Last checked

==================================================
20. MONITORING SETTINGS
==================================================

Allow configurable intervals:

1 minute
5 minutes
10 minutes
15 minutes
30 minutes
1 hour

Also configure:

- Timeout
- Slow threshold
- Failure threshold

Do not hard-code these values.

==================================================
21. MANUAL CHECK
==================================================

"Check Now" should:

1. Show loading state.
2. Call backend.
3. Perform health check.
4. Measure response time.
5. Save result.
6. Update website status.
7. Update analytics.
8. Update UI.
9. Show success/error toast.

Prevent excessive manual requests using rate limiting/cooldown.

==================================================
22. DATABASE DESIGN
==================================================

Use MongoDB + Mongoose.

Create models:

User
Site
HealthCheck
Incident
Notification
Settings

SITE:

- _id
- userId
- name
- url
- healthEndpoint
- description
- tags
- monitoringEnabled
- intervalMinutes
- timeoutSeconds
- slowThresholdMs
- failureThreshold
- currentStatus
- currentResponseTime
- lastCheckedAt
- uptimePercentage
- createdAt
- updatedAt

HEALTH CHECK:

- _id
- siteId
- checkedAt
- success
- statusCode
- responseTimeMs
- errorType
- errorMessage
- source

INCIDENT:

- _id
- siteId
- userId
- status
- reason
- startedAt
- resolvedAt
- durationSeconds
- createdAt

NOTIFICATION:

- _id
- userId
- siteId
- incidentId
- type
- title
- message
- read
- createdAt

USER:

- _id
- name
- email
- password
- avatar
- createdAt
- updatedAt

Add appropriate indexes.

Especially index:

siteId
checkedAt

and:

userId

==================================================
23. DATA RETENTION
==================================================

Do not allow health-check data to grow forever.

Implement a configurable retention strategy:

7 days
30 days
90 days
180 days

Create a cleanup job for old health-check records.

For long-term analytics, consider aggregation rather than storing unlimited raw checks.

==================================================
24. API STRUCTURE
==================================================

Create clean Express REST APIs.

Authentication:

POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me

Sites:

GET /api/sites
POST /api/sites
GET /api/sites/:id
PATCH /api/sites/:id
DELETE /api/sites/:id

Health:

POST /api/sites/:id/check
GET /api/sites/:id/health
GET /api/sites/:id/analytics

Dashboard:

GET /api/dashboard/stats

Incidents:

GET /api/incidents
GET /api/incidents/:id

Notifications:

GET /api/notifications
PATCH /api/notifications/:id/read

Monitoring:

POST /api/monitor/run

Settings:

GET /api/settings
PATCH /api/settings

Keep controllers, services, routes, models, and utilities separate.

==================================================
25. BACKEND STRUCTURE
==================================================

Use a clean architecture.

server/

src/

config/
controllers/
middleware/
models/
routes/
services/
jobs/
utils/
types/
validators/
app.ts
server.ts

Services should include:

monitoringService
healthCheckService
incidentService
notificationService
analyticsService

Jobs:

monitoringJob
cleanupJob

==================================================
26. FRONTEND STRUCTURE
==================================================

Use:

client/

src/

components/
  layout/
  dashboard/
  sites/
  charts/
  incidents/
  notifications/
  settings/
  ui/

pages/

hooks/

services/

context/

types/

utils/

constants/

lib/

App.tsx

Do NOT put the whole application in App.tsx.

==================================================
27. AUTHENTICATION
==================================================

Implement JWT authentication.

Use secure cookies where appropriate.

Requirements:

- Register
- Login
- Logout
- Protected routes
- Current-user endpoint
- Password hashing with bcrypt
- User-specific data

A user must NEVER be able to access another user's websites.

Every relevant MongoDB query must be scoped to authenticated userId.

==================================================
28. SECURITY
==================================================

Implement:

- Helmet
- CORS configuration
- Rate limiting
- Request validation
- URL validation
- SSRF protection
- Password hashing
- JWT security
- HTTP-only cookies
- Secure environment variables
- No secrets in frontend
- No secrets committed to Git
- .env.example
- Safe error messages

Never expose:

MONGODB_URI
JWT_SECRET
private API credentials

to the React frontend.

==================================================
29. UI / UX DESIGN
==================================================

Build a premium developer SaaS UI.

Navigation:

Sidebar:

Dashboard
Websites
Incidents
Analytics
Notifications
Settings

Bottom:

User profile
Theme switcher

Header:

Page title
Search
Notifications
Profile

Use:

- Cards
- Tables
- Badges
- Modals
- Dropdowns
- Tooltips
- Toasts
- Skeletons
- Empty states
- Error states

Use Lucide icons.

Do not make the UI unnecessarily complicated.

Focus on excellent visual hierarchy.

==================================================
30. DESIGN STYLE
==================================================

Design should feel like a modern developer product.

Inspired by the quality level of:

- Vercel
- Linear
- Better Uptime
- UptimeRobot
- GitHub

But DO NOT copy their interfaces.

Create an original design.

Use:

- Clean typography
- Subtle borders
- Rounded cards
- Excellent spacing
- Minimal shadows
- Clear status indicators
- Professional charts
- Subtle animations

Support:

Light Mode
Dark Mode
System Mode

==================================================
31. RESPONSIVE DESIGN
==================================================

Must work on:

Desktop
Laptop
Tablet
Mobile

Desktop:

Sidebar + dashboard

Tablet:

Collapsible sidebar

Mobile:

Slide-out navigation
Stacked stats
Responsive cards
Scrollable charts
Mobile-friendly forms

==================================================
32. ACCESSIBILITY
==================================================

Use:

- Semantic HTML
- Keyboard navigation
- Proper form labels
- Focus states
- ARIA where necessary
- Accessible buttons
- Good contrast

Do not communicate status only through colors.

Use:

🟢 + Online

rather than only a green dot.

==================================================
33. LOADING / EMPTY / ERROR STATES
==================================================

Create polished states.

No websites:

"No websites monitored yet"

"Add your first project to start tracking uptime and response time."

Button:

+ Add Website

Also create:

- Loading skeleton
- Chart loading
- Health check loading
- API error
- Empty incidents
- Empty analytics
- No search results

==================================================
34. ADD WEBSITE MODAL
==================================================

Create a polished form.

Fields:

Website Name
Website URL
Health Check URL
Description
Tags
Monitoring Interval
Timeout
Slow Threshold
Failure Threshold
Monitoring Enabled

Add:

- Validation
- Helpful descriptions
- URL preview
- Loading state
- Error state
- Success toast

==================================================
35. ANALYTICS PAGE
==================================================

Create:

/analytics

Show overall platform analytics:

- Total monitored websites
- Overall uptime
- Average response time
- Total incidents
- Total downtime
- Most reliable websites
- Slowest websites
- Most frequently failing websites

Charts:

- Overall uptime
- Response time trends
- Incident trends
- Status distribution

==================================================
36. SETTINGS PAGE
==================================================

Create:

/settings

Sections:

Monitoring Settings
Notification Settings
Appearance
Data Retention
Account

Monitoring:

Default interval
Default timeout
Default slow threshold
Default failure threshold

Appearance:

Light
Dark
System

Data retention:

7 days
30 days
90 days
180 days

==================================================
37. REAL-TIME / DATA REFRESH
==================================================

When the dashboard is open:

- Refresh monitoring data periodically.
- Update statuses without full-page reload.
- Show relative timestamps.

Examples:

10 seconds ago
2 minutes ago
1 hour ago

Avoid excessive API requests.

==================================================
38. PERFORMANCE
==================================================

Optimize for performance.

Avoid:

- Excessive polling
- Huge API payloads
- Loading all historical checks
- Unnecessary React re-renders

Use:

- Pagination
- Aggregated analytics
- Proper MongoDB indexes
- Efficient queries
- Memoization where appropriate
- Lazy loading

==================================================
39. DEMO DATA
==================================================

During development, provide realistic demo data.

Example websites:

Recallix
Movie Spark
Portfolio
API Server
Korean Hive

Generate realistic:

- Response times
- Uptime percentages
- Health checks
- Incidents

Make it obvious which data is mock/demo data.

Production mode must use MongoDB.

==================================================
40. CRON MONITORING
==================================================

Implement Node.js scheduled monitoring using node-cron.

Example:

Every 5 minutes:

1. Find enabled websites.
2. Determine sites due for a check.
3. Run health checks.
4. Save results.
5. Update status.
6. Detect incidents.
7. Resolve recovered incidents.
8. Trigger notifications.
9. Log monitoring summary.

Example response:

{
  "checked": 12,
  "online": 10,
  "slow": 1,
  "offline": 1,
  "errors": 0
}

Do not create an infinite-running process inside a serverless function.

The monitoring backend must run on an always-on Node-compatible service if node-cron is used.

==================================================
41. DEPLOYMENT ARCHITECTURE
==================================================

Frontend:

React + Vite
→ Vercel

Backend:

Node.js + Express
→ Render / Railway / VPS

Database:

MongoDB Atlas

Example:

User
 ↓
Vercel React App
 ↓
Express API
 ↓
MongoDB Atlas

                    Express Backend
                          |
                 ┌────────┴────────┐
                 ↓                 ↓
           MongoDB Atlas      Monitoring Job
                                   |
                                   ↓
                           External Websites

IMPORTANT:

If the Node backend itself is deployed somewhere that sleeps, node-cron will not be reliable.

Therefore recommend an always-on backend/VPS for production monitoring.

Alternatively, provide an external cron integration that can call:

POST /api/monitor/run

with secure authentication.

==================================================
42. ENVIRONMENT VARIABLES
==================================================

Create:

.env.example

Include appropriate variables such as:

MONGODB_URI=
JWT_SECRET=
CLIENT_URL=
PORT=
NODE_ENV=
MONITOR_CRON_SECRET=

Never hard-code secrets.

==================================================
43. ERROR HANDLING
==================================================

Handle:

- Invalid URLs
- Timeout
- DNS errors
- Connection refused
- HTTP 404
- HTTP 500
- Network failures
- MongoDB errors
- Authentication errors
- Cron errors
- Rate limits

Never crash the entire monitoring process because one website failed.

If one site fails, continue checking the remaining sites.

==================================================
44. API ERROR FORMAT
==================================================

Use a consistent API response format.

Success:

{
  "success": true,
  "message": "...",
  "data": {}
}

Error:

{
  "success": false,
  "message": "...",
  "error": {
    "code": "...",
    "details": "..."
  }
}

==================================================
45. MICRO-INTERACTIONS
==================================================

Add subtle animations:

- Card hover
- Status transitions
- Modal opening
- Toast notifications
- Skeleton loading
- Chart animations
- Sidebar transitions

Do not over-animate.

Performance comes first.

==================================================
46. PROJECT DOCUMENTATION
==================================================

Create a complete README.md.

Include:

- Project overview
- Features
- Tech stack
- Architecture
- Folder structure
- Environment variables
- Local setup
- MongoDB Atlas setup
- Backend setup
- Frontend setup
- Authentication setup
- Monitoring setup
- Cron setup
- Deployment
- Vercel deployment
- Backend deployment
- Security
- SSRF protection
- Known limitations
- Future improvements

==================================================
47. LOCAL DEVELOPMENT
==================================================

The project should support:

Frontend:

npm install
npm run dev

Backend:

npm install
npm run dev

Use appropriate scripts:

dev
build
start
lint

Make sure TypeScript builds correctly.

==================================================
48. TESTING / QUALITY
==================================================

Before considering the project complete, verify:

- No TypeScript errors
- No broken imports
- No console errors
- Frontend builds successfully
- Backend builds successfully
- MongoDB connection works
- Authentication works
- CRUD works
- Health checks work
- Timeout works
- Response time measurement works
- Status detection works
- Incident detection works
- Incident recovery works
- Analytics work
- Charts work
- Notifications work
- Cron monitoring works
- SSRF protection works
- Rate limiting exists
- User data isolation works
- Responsive UI works
- Dark mode works

==================================================
49. IMPORTANT DEVELOPMENT RULES
==================================================

Do NOT create everything inside one file.

Do NOT use fake architecture.

Do NOT create frontend-only fake monitoring and call it production-ready.

Do NOT put MongoDB credentials in React.

Do NOT expose JWT secrets.

Do NOT blindly fetch arbitrary URLs from the backend.

Do NOT ignore CORS/SSRF limitations.

Do NOT use Supabase or Firebase.

Do NOT use Next.js.

Use proper MERN architecture.

Keep:

Frontend
Backend
Database
Monitoring
Authentication
Analytics

properly separated.

==================================================
50. DEVELOPMENT PROCESS
==================================================

Build the project systematically.

STEP 1:
Analyze requirements and architecture.

STEP 2:
Create project structure.

STEP 3:
Set up React + Vite + TypeScript + Tailwind.

STEP 4:
Set up Node + Express + TypeScript.

STEP 5:
Set up MongoDB + Mongoose.

STEP 6:
Create database models.

STEP 7:
Implement authentication.

STEP 8:
Implement website CRUD.

STEP 9:
Implement health-check service.

STEP 10:
Implement monitoring scheduler.

STEP 11:
Implement incidents.

STEP 12:
Implement analytics.

STEP 13:
Implement notifications.

STEP 14:
Build dashboard UI.

STEP 15:
Build website details page.

STEP 16:
Build analytics page.

STEP 17:
Build incidents page.

STEP 18:
Build settings page.

STEP 19:
Add security and SSRF protection.

STEP 20:
Add responsive design.

STEP 21:
Test and fix all issues.

STEP 22:
Prepare deployment.

==================================================
51. FINAL UI REQUIREMENT
==================================================

The final UI should immediately feel like a professional developer SaaS application.

Dashboard example:

--------------------------------------------------

Good evening, Developer 👋

Here's the health of your monitored services.

[ 12 Websites ] [ 9 Online ] [ 2 Slow ] [ 1 Offline ]

--------------------------------------------------

Website Health                         View All →

┌────────────────────────────────────────────────┐
│ ● Recallix                         ONLINE       │
│   https://recallix.onrender.com                │
│                                                │
│   382 ms       HTTP 200       99.92% uptime    │
│   Last checked: 32 seconds ago                 │
│                                                │
│   [Check Now] [View Details]                   │
└────────────────────────────────────────────────┘

--------------------------------------------------

Response Time

       ╱╲
      ╱  ╲      ╱╲
  ╱───╯    ╲────╯  ╲────

--------------------------------------------------

Recent Incidents

🔴 Movie Spark
Service unavailable
5 minutes

🟢 Recallix
Recovered
2 minutes ago

--------------------------------------------------

Make the final experience polished, fast, intuitive, responsive, and visually impressive.

==================================================
52. FINAL INSTRUCTION
==================================================

I want you to ACTUALLY BUILD THIS APPLICATION.

Do not only explain the concept.

Start by:

1. Analyzing the architecture.
2. Showing the complete folder structure.
3. Creating the MongoDB/Mongoose schema.
4. Creating the backend architecture.
5. Creating the frontend architecture.
6. Then implement the application step-by-step.

Generate production-quality code for the required files.

Do not skip important files with placeholders like:

"implement later"
"remaining code"
"etc."

If a file is large, still provide the complete implementation.

After implementation, explain:

- How to run locally
- How frontend communicates with backend
- How MongoDB works
- How monitoring works
- How node-cron works
- How incidents are detected
- How uptime is calculated
- How to configure environment variables
- How to deploy frontend to Vercel
- How to deploy backend
- How to configure MongoDB Atlas
- How to secure the monitoring API
- How SSRF protection works
- How to configure an external cron service if needed

The final product should be a **real MERN-based Site Health Monitor**, not a static UI mockup.
