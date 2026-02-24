# MoonDesk — Complete Product Documentation
**Product**: MoonDesk by Tek4All
**Version**: Current (as of February 2026)
**Audience**: End Users, Administrators, Onboarding Teams
**Document Type**: Comprehensive Feature Reference & Product Guide

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Getting Started](#2-getting-started)
3. [Navigation & Layout](#3-navigation--layout)
4. [Dashboard Home](#4-dashboard-home)
5. [Programmes](#5-programmes)
6. [Tasks](#6-tasks)
7. [CRM — Stakeholder Management](#7-crm--stakeholder-management)
8. [Opportunity Radar](#8-opportunity-radar)
9. [Calendar](#9-calendar)
10. [Messaging](#10-messaging)
11. [Shared Mail](#11-shared-mail)
12. [Check-ins](#12-check-ins)
13. [Team Directory](#13-team-directory)
14. [Google Drive Integration](#14-google-drive-integration)
15. [Activity Log](#15-activity-log)
16. [Analytics & Reports](#16-analytics--reports)
17. [Luna — AI Assistant](#17-luna--ai-assistant)
18. [Administration (Control Tower)](#18-administration-control-tower)
19. [Settings](#19-settings)
20. [User Roles & Permissions](#20-user-roles--permissions)
21. [Keyboard Shortcuts](#21-keyboard-shortcuts)
22. [Data Reference: Status, Priority & Type Definitions](#22-data-reference)
23. [Frequently Asked Questions](#23-frequently-asked-questions)

---

## 1. Product Overview

MoonDesk is an all-in-one programme management and operations platform built for Tek4All. It centralises task tracking, stakeholder relationship management, funding opportunity discovery, team communication, and AI-assisted workflows into a single workspace.

### Core Capabilities

| Module | What it Does |
|---|---|
| **Programmes** | Create and manage initiatives with members, status tracking, and linked resources |
| **Tasks** | Assign, prioritise, and track work items with evidence submission and review |
| **CRM** | Manage stakeholder relationships, interactions, contributions, and engagement scoring |
| **Opportunity Radar** | Discover and classify funding opportunities automatically via AI |
| **Calendar** | Schedule and track events, meetings, and deadlines |
| **Messaging** | Team-level direct messaging and conversation threads |
| **Shared Mail** | Access and collaborate on a shared `impact@tekforall.org` inbox |
| **Check-ins** | Submit and review regular progress check-ins |
| **Google Drive** | Browse, upload, and link files from the organisation's Drive |
| **Activity Log** | Audit trail of all actions across the platform |
| **Analytics** | KPI dashboards, programme progress, team activity |
| **Luna AI** | Conversational assistant to create tasks, check statuses, run guided workflows |

### Technology Highlights

- **Secure Authentication** via Supabase Auth (cookie-based, JWT)
- **Real-time capable** via Supabase subscriptions
- **Google Workspace Integration** — Gmail delegation, Drive, Calendar
- **AI-Powered** — Anthropic Claude for opportunity classification; Google Gemini for Luna intent engine
- **Daily Automation** — Opportunity scanning at 06:00 UTC; notification summaries at 08:00 UTC

---

## 2. Getting Started

### Signing In

1. Navigate to the MoonDesk URL provided by your administrator.
2. Enter your **email address** and **password**.
3. Click **Sign In**.
4. If your account requires a password change, you will be prompted immediately after login.

> **First-time users**: Your account is created by an administrator. You will receive your credentials directly. If you have not received them, contact your system admin.

### What you see after login

You are taken to the **Dashboard Home** — a personalised overview of your tasks, upcoming events, and recent activity. The left sidebar provides navigation to all modules.

---

## 3. Navigation & Layout

### Sidebar

The left sidebar is the primary navigation. Items shown depend on your role and group membership.

| Sidebar Item | Icon | Who Sees It |
|---|---|---|
| Dashboard | Home | All users |
| Programmes | Folder | All users |
| Tasks | Checkbox | All users |
| Team | Users | Managers and above |
| Messaging | Chat bubble | All users |
| Check-ins | Calendar check | All users |
| CRM | Handshake | All users |
| Opp. Radar | Radar | Radar group members |
| Calendar | Calendar | All users |
| Shared Mail | Mail | Shared mail group members |
| Activity | Activity | All users |
| Analytics | Bar chart | All users |
| Drive | Cloud | All users |
| Control Tower | Shield | Admins only |
| Reports | Document | All users |
| Settings | Gear (bottom) | All users |

**Mobile**: On small screens, the sidebar collapses. Tap the hamburger menu (top left) to open it.

### Top Bar

- **Logo / Branding** — Returns to dashboard home
- **Global Search** — Click or press `Cmd+K` / `Ctrl+K` to open
- **User Menu** — Access settings or sign out
- **Notifications** — Bell icon for unread alerts

### App Shell

The main content area is to the right of the sidebar. All module content loads here. Pages are full-width and responsive.

---

## 4. Dashboard Home

**Route**: `/`

The dashboard is your personalised landing page. It aggregates information from across the platform into a single view.

### Stats Cards

Four summary cards appear at the top:

| Card | What it Shows |
|---|---|
| **My Tasks** | Count of tasks assigned to you |
| **Overdue** | Tasks past their due date |
| **Completed** | Tasks marked as Done |
| **Programmes** | Total active programmes |

### Upcoming Tasks

A list of tasks due this week, sorted by due date. Each task shows:
- Title and current status
- Priority badge (colour-coded)
- Due date with urgency indicator (red if overdue, amber if due soon)
- Linked programme name

Click any task to open the task detail page.

### Upcoming Events

Calendar events for the next 7 days. Each event shows:
- Event name and time
- Meeting link (if available, e.g., Zoom/Meet)

### Recent Activity

A feed of recent actions across the platform (filtered to your scope). Includes:
- Task created / updated
- Programme changes
- Team logins
- Evidence submitted

### Quick Actions

Buttons for common operations:
- **New Task** — Opens the create task form
- **New Programme** — Opens the create programme form
- **View All Tasks** — Goes to the tasks list

---

## 5. Programmes

**Route**: `/programmes`

Programmes represent major initiatives or projects. Everything in MoonDesk can be linked to a programme.

### Programmes Directory

Displays all programmes as a grid of cards (1–3 columns depending on screen size).

**Each card shows**:
- Programme name
- Status badge (Draft / Active / Paused / Completed / Archived)
- Short description
- Start date
- Member count

**Sorting Options**:
- Latest (most recently created)
- Alphabetical
- Recently Updated

Click a card to open the programme detail page.

### Creating a Programme

**Route**: `/programmes/new`

Fill in the form:

| Field | Description | Required |
|---|---|---|
| **Name** | Programme title | Yes |
| **Description** | Background, goals, scope | No |
| **Status** | Draft, Active, Paused, Completed, Archived | Yes |
| **Start Date** | When the programme begins | No |
| **End Date** | When the programme ends | No |

Click **Create Programme** to save.

### Programme Detail

**Route**: `/programmes/[id]`

The detail page shows all information about a programme:

- **Overview tab**: Description, dates, status
- **Members tab**: Team members with their roles (Owner / Manager / Member). Managers and above can add or remove members.
- **Tasks tab**: All tasks linked to this programme
- **Stakeholders tab**: CRM stakeholders linked to this programme with their roles
- **Related Opportunities tab**: Funding opportunities linked to this programme (from Opportunity Radar)

**Edit Programme**: Click the **Edit** button (top right) to modify any field.

### Programme Statuses

| Status | Meaning |
|---|---|
| **Draft** | Being planned, not yet started |
| **Active** | Currently running |
| **Paused** | Temporarily on hold |
| **Completed** | Finished successfully |
| **Archived** | Closed, kept for records |

---

## 6. Tasks

**Route**: `/tasks`

Tasks are the fundamental unit of work in MoonDesk. They can exist independently or be linked to a programme.

### Task Views

You can toggle between two views:

- **List View** — Table with sortable columns: Title, Status, Priority, Due Date, Assignee, Programme
- **Kanban Board** — `/tasks/board` — Drag-and-drop columns organised by status

### Filtering Tasks

Filters available on the task list:
- **Status**: To Do, In Progress, Done, Blocked
- **Priority**: Low, Medium, High, Urgent
- **Assignee**: Filter by team member
- **Due Date**: Filter by date range

### Creating a Task

**Route**: `/tasks/new`

| Field | Description | Required |
|---|---|---|
| **Title** | Short, clear description of the work | Yes |
| **Description** | Detailed instructions, context, links | No |
| **Status** | To Do, In Progress, Done, Blocked | Yes (default: To Do) |
| **Priority** | Low, Medium, High, Urgent | Yes (default: Medium) |
| **Due Date** | Target completion date | No |
| **Programme** | Link to a programme | No |
| **Assignee** | Team member responsible | No |

### Task Detail

**Route**: `/tasks/[id]`

The task detail page contains:

**Overview**
- Full title, description, priority badge, status, due date
- Linked programme (clickable)
- Assigned team member

**Subtasks**
- Create child tasks beneath the main task
- Check off completed subtasks
- Delete subtasks

**Dependencies**
- View and manage blocking relationships (Task A blocks Task B)
- Cannot mark a task Done if a blocking dependency is incomplete

**Attachments**
- Upload files related to this task
- Download links for all attached files
- Delete attachments (if you have edit access)

**Evidence Submission**
- Submit proof of task completion (required for some tasks)
- Write a description + attach supporting files
- Once submitted, a manager reviews and approves/rejects

**Activity Timeline**
- Full history of status changes, comments, edits
- Timestamps and actor names

### Task Statuses

| Status | Meaning |
|---|---|
| **To Do** | Not yet started |
| **In Progress** | Actively being worked on |
| **Done** | Completed |
| **Blocked** | Cannot proceed (waiting on something external) |

### Task Priorities

| Priority | Use When |
|---|---|
| **Low** | Nice to have, no deadline pressure |
| **Medium** | Standard work item |
| **High** | Important, should be done soon |
| **Urgent** | Critical, needs immediate attention |

### Kanban Board

**Route**: `/tasks/board`

Four columns match the four task statuses. Drag cards between columns to update status. Cards show priority, due date, assignee, and programme.

---

## 7. CRM — Stakeholder Management

**Route**: `/crm`

The CRM module manages all external stakeholders: donors, partners, governments, media, beneficiaries, and more.

### Stakeholder Directory

Grid of stakeholder cards (3 columns on desktop, responsive on mobile).

**Each card shows**:
- Name and type badge
- Status (Active / Inactive / Prospective)
- Email address
- Phone number
- Last interaction date with engagement indicator
- Number of linked contacts and programmes

**Engagement Indicator** (coloured dot):
- Green (Hot): Last interaction ≤ 14 days ago
- Yellow (Warm): 15–30 days ago
- Orange (Cooling): 31–60 days ago
- Red (Cold): 61+ days ago or never interacted

### Filtering & Sorting

**Filters**:
- Type (Donor, Partner, Beneficiary, Government, Media, Academic, Corporate, Other)
- Status (Active, Inactive, Prospective)
- Engagement Level (Hot, Warm, Cooling, Cold)

**Sort**:
- Latest (most recently added)
- Alphabetical
- Engagement (hottest first)

### Exporting Stakeholders

Click the **Export CSV** button to download all stakeholders as a spreadsheet. Exported fields include: Name, Type, Status, Email, Phone, Website, Tags, Last Interaction Date.

### Creating a Stakeholder

**Route**: `/crm/new`

| Field | Description |
|---|---|
| **Name** | Organisation or individual name |
| **Type** | Donor / Partner / Beneficiary / Government / Media / Academic / Corporate / Other |
| **Status** | Active / Inactive / Prospective |
| **Email** | Primary contact email |
| **Phone** | Primary phone number |
| **Address** | Physical address |
| **Website** | URL |
| **Tags** | Free-text labels for searching/grouping |
| **Notes** | Internal notes |

### Stakeholder Detail

**Route**: `/crm/[id]`

Contains:

**Profile** — All basic info (name, type, email, phone, address, tags)

**Contacts** — Individual people associated with this stakeholder organisation (separate from the stakeholder itself — e.g., staff at a donor org)

**Linked Programmes** — Programmes this stakeholder is involved in, with their assigned role:
- Funder
- Technical Partner
- Implementing Partner
- Evaluator
- Beneficiary
- Advisor

Use the **Link to Programme** button to associate this stakeholder with a programme and assign a role.

**Contributions** — Financial contributions logged (type: Pledge / Disbursement / In-Kind, amount, date)

**Interaction History** — Chronological log of all touchpoints:
- Type: Meeting / Call / Email / Note / Visit / Event
- Date and summary
- Add new interactions from this view

### Stakeholder Types

| Type | Description |
|---|---|
| **Donor** | Financial supporter or grant-maker |
| **Partner** | Implementing or technical collaboration organisation |
| **Beneficiary** | Direct recipient of services/programmes |
| **Government** | Government body, ministry, or agency |
| **Media** | Press, journalists, media organisations |
| **Academic** | Universities, research institutions |
| **Corporate** | Private sector companies |
| **Other** | Anything not fitting the above |

---

## 8. Opportunity Radar

**Route**: `/radar`

The Opportunity Radar automatically discovers and classifies funding opportunities — grants, partnerships, RFPs, fellowships, and awards — using AI. It scans configured data sources daily at 06:00 UTC and ranks results by mission alignment, qualification likelihood, and deadline urgency.

> **Access**: Only users in the Radar group can see this module. Contact an admin to request access.

### Dashboard Stats

Five summary cards at the top:

| Card | Meaning |
|---|---|
| **Total Opportunities** | All opportunities in the pipeline |
| **New Today** | Discovered in the last 24 hours |
| **Closing Soon** | Deadline in ≤ 7 days |
| **High Match** | Mission alignment rated "High" |
| **Pipeline Value** | Sum of max funding amounts across all active opportunities |

### Opportunity Cards

Each opportunity card displays:
- **Type badge** (Grant, Partnership, RFP, Fellowship, Award, Corporate Training, Other)
- **Stage** (editable for Editors and Admins — see below)
- **Title** and **Funder Organisation**
- **Summary** — AI-generated or scraped description
- **Funding Range** — e.g., "USD 10,000 — USD 100,000"
- **Deadline** — with urgency colour coding:
  - Red: ≤ 3 days
  - Orange: 4–7 days
  - Yellow: 8–14 days
  - Green: 15+ days
- **Region** and **Sector** tags
- **Mission Alignment** — High / Medium / Low (AI-assessed)
- **Qualification Status** — Likely Qualify / Partial Match / Unlikely (AI-assessed)
- **Confidence Score** — AI confidence in classification (0–100%)

### Searching & Filtering

**Search bar**: Full-text search across title, funder, summary, and sector.

**Filters**:
- Type (Grant, Partnership, RFP, Fellowship, Award, Corporate Training, Other)
- Stage (New, Reviewing, Preparing, Submitted, Shortlisted, Awarded, Rejected, Expired, Archived)

**Sort**:
- Latest (most recently discovered)
- Deadline (most urgent first)
- Highest Amount

### Opportunity Stages

| Stage | Meaning |
|---|---|
| **New** | Just discovered, not yet reviewed |
| **Reviewing** | Team is assessing fit and feasibility |
| **Preparing** | Application/proposal in progress |
| **Submitted** | Application has been sent |
| **Shortlisted** | Notified we are being considered |
| **Awarded** | Successfully won the opportunity |
| **Rejected** | Application was unsuccessful |
| **Expired** | Deadline passed without action |
| **Archived** | Deliberately set aside |

### Opportunity Detail

**Route**: `/radar/[id]`

Full detail view including:
- All AI-classified fields
- Stage history
- Internal notes
- Linked stakeholder (e.g., the funder in CRM)

### Pipeline View

**Route**: `/radar/pipeline`

Funnel visualisation showing how many opportunities are in each stage. Useful for forecasting and pipeline health reporting.

### For Editors: Updating Stages

If you are a Radar **Editor** or **Admin**, you can update the stage directly from the card dropdown on the radar list page, or from the full opportunity detail page.

### For Admins: Managing Sources

The **Sources Panel** (visible to Radar admins) shows all configured data sources:

| Source Type | Description |
|---|---|
| **RSS** | Standard RSS feed URL |
| **API** | REST API endpoint with auth config |
| **Scrape** | Web page scrape configuration |
| **Email** | Email-based source |
| **Manual** | Manually entered opportunities |

Admin actions:
- **Add Source** — Configure a new feed or API
- **Toggle Active/Inactive** — Pause a source without deleting it
- **Edit** — Update URL, credentials, schedule
- **Error Tracking** — See last error + error count per source

### For Admins: Manual Scan

Click **Scan Now** to immediately trigger the opportunity discovery pipeline:
1. Fetches all active sources
2. Parses and deduplicates results
3. Classifies via Claude AI
4. Inserts new opportunities to the database
5. Returns a scan report: sources checked, new items found, errors

### For Admins: Group Manager

Manage who has access to the Opportunity Radar module and at what permission level. See [User Roles & Permissions](#20-user-roles--permissions) for radar-specific roles.

---

## 9. Calendar

**Route**: `/calendar`

A full scheduling calendar for the organisation.

### Views

Toggle between:
- **Monthly** — Overview grid
- **Weekly** — 7-day detailed view
- **Daily** — Hourly agenda

### Creating Events

Click any date/time slot or use the **+ New Event** button.

| Field | Description |
|---|---|
| **Title** | Event name |
| **Start Time** | Date and time |
| **End Time** | Date and time |
| **All Day** | Toggle for all-day events |
| **Meeting Link** | URL (Zoom, Google Meet, Teams, etc.) |
| **Description** | Notes, agenda |
| **Participants** | Invite team members |

### RSVP

Participants can respond to event invitations:
- **Attending**
- **Declined**

Events with meeting links display a clickable button to join the call.

### Dashboard Integration

Events in the next 7 days appear on the **Dashboard Home** for quick reference.

---

## 10. Messaging

**Route**: `/messaging`

Internal team messaging. Create conversation threads with one or more team members.

### Conversation List

Left panel shows all your conversations:
- Participant names and avatars
- Last message preview
- Unread count badge
- Timestamp

Click a conversation to open it.

### Message Thread

**Route**: `/messaging/[id]`

Right panel shows the full conversation history:
- Messages ordered chronologically
- User avatars next to each message
- Timestamps
- Support for rich content (links)

Type in the reply box at the bottom and press Enter or click Send.

---

## 11. Shared Mail

**Route**: `/shared-mail`

> **Access**: Only members of the `shared_mail_admin` group can see this module.

Shared Mail provides access to the `impact@tekforall.org` inbox. Multiple authorised team members can read, reply to, and manage emails collaboratively — without needing direct access to the Google Workspace account.

### Email Thread List

Shows all threads in the shared inbox:
- Sender name and email
- Subject line
- Date received
- Unread indicator

Use the search and filter bar to narrow results.

### Email Thread Detail

**Route**: `/shared-mail/[id]`

Opens the full email conversation:
- Full message bodies
- Attachments
- Reply composer

**Replying**:
- Write your reply in the compose box
- Replies send from `impact@tekforall.org`
- AI-assisted drafts can be generated via Gemini (smart reply suggestions)

**Email Classification**:
- Incoming emails can be auto-routed to a programme/team using Gemini AI classification
- Suggested routing: programme, assignee, priority, tags
- Review and confirm before applying

---

## 12. Check-ins

**Route**: `/checkins`

Check-ins provide a structured way for team members to report progress regularly.

### Check-in List

Shows all your submitted check-ins:
- Date
- Status
- Summary notes

### Creating a Check-in

**Route**: `/checkins/new`

Fill in the structured form with your update. Fields vary by template but typically include:
- What you completed since last check-in
- What you plan to do next
- Any blockers or challenges
- Overall status (On Track / At Risk / Blocked)

### Team Check-ins (Manager View)

**Route**: `/checkins/team`

Managers can see an aggregated view of check-ins from all direct reports:
- Who has submitted for the current period
- Who is overdue
- Status summary across the team

---

## 13. Team Directory

**Route**: `/team`

> **Access**: Managers and above only.

A directory of all team members in the organisation.

### What's Shown

- Staff list with names, usernames, and roles
- Department / reporting structure
- Manager-report hierarchy

### Hierarchy Management

Admins can configure manager-report relationships in **Control Tower → Hierarchy**. This affects:
- What data a manager can see (tasks, check-ins, activity logs for their reports)
- Notification routing
- Team check-in aggregation

---

## 14. Google Drive Integration

**Route**: `/drive`

Browse and manage files in the organisation's Google Drive without leaving MoonDesk.

### File Browser

- **Breadcrumb navigation** — Shows current folder path
- **File/folder listing** — Icons, names, modified dates, sizes
- **Navigate into folders** — Click to open

### Actions

- **Upload** — Upload files from your computer to the current folder
- **Create Folder** — Add a new folder
- **Download** — Click a file to download
- **Search** — Search within Drive

### Linking Files to Tasks

From a task's attachment section, use the **Drive File Picker** to select and link a Drive file instead of uploading a new one.

---

## 15. Activity Log

**Route**: `/activity`

A paginated audit trail of all significant actions across the platform, filtered to what you have permission to see (your own actions, plus your direct reports' actions for managers).

### What's Logged

| Action | Trigger |
|---|---|
| `user_login` | User signed in |
| `task_created` | New task created |
| `task_updated` | Task fields changed |
| `task_status_changed` | Status moved (e.g., To Do → Done) |
| `task_evidence_submitted` | Evidence submitted for review |
| `programme_created` | New programme created |
| `programme_updated` | Programme fields changed |
| `email_sent` | Email sent from Shared Mail |
| `checkin_submitted` | Check-in form submitted |

Each log entry shows:
- **Who** did the action (name)
- **What** happened (action label)
- **When** (date and time)
- **On what** (entity type and name, clickable link)
- **Details** (additional context in JSON)

---

## 16. Analytics & Reports

### Analytics Dashboard

**Route**: `/analytics`

Platform-wide KPI view:

- **Tasks Completed** — Count and trend over time
- **Active Programmes** — Current programme count
- **Team Engagement** — Activity metrics
- **Task Completion Rate** — Percentage of tasks completed vs. total
- **Programme Progress** — Overall health across programmes
- **Team Activity** — Per-member action counts

Charts are rendered as bar charts, line graphs, and progress indicators.

### Reports

**Route**: `/reports`

Generate structured reports and export them.

**Report Types**:
- Programme Report — Progress, tasks, stakeholders, budget summary for a specific programme
- Task Summary — Task list with filters applied (date range, assignee, status)
- Team Engagement Report — Check-ins, activity, task completion per team member

**Export Formats**:
- **CSV** — Spreadsheet-compatible data export
- **PDF** — Formatted printable document (generated via html2canvas + jsPDF)

---

## 17. Luna — AI Assistant

Luna is MoonDesk's built-in conversational AI assistant. She can create tasks, update statuses, query data, and guide you through multi-step workflows — all via natural language.

### Opening Luna

- Click the **Luna button** (floating action button, bottom right corner)
- Or press `Cmd+L` (Mac) / `Ctrl+L` (Windows/Linux)

Luna opens as a drawer panel from the right side.

### What Luna Can Do

| Capability | Example Phrases |
|---|---|
| **Create a task** | "Create a task to review the budget" |
| **Update task status** | "Mark the Sabitek report task as done" |
| **Create a programme** | "Create a new programme called Digital Futures" |
| **Update programme status** | "Set the Sabitek programme to active" |
| **Query programmes** | "What programmes are currently active?" |
| **Query tasks** | "Show me all overdue tasks" |
| **Check who missed check-ins** | "Who hasn't submitted a check-in this week?" |
| **Run a guided workflow** | "Start a weekly review" |
| **Navigate** | "Take me to the calendar" |

### How Conversations Work

Luna uses a multi-step conversation model:

1. **You type a message** — e.g., "Create a task to prepare the annual report, high priority"
2. **Luna classifies your intent** — Uses AI to understand what you want
3. **If information is missing** — Luna asks follow-up questions:
   - "Which programme does this belong to? (or say 'skip')"
   - "Who should this be assigned to? (or say 'skip')"
4. **You provide the missing details** — Reply naturally
5. **Luna shows a preview** — An action card summarising what will happen
6. **You confirm or cancel** — Type "confirm", click Confirm, or say "cancel"
7. **Luna executes the action** — Creates the task and shows a link

> **Important**: Luna will NOT take any action without showing you a preview first. You always confirm before anything is written to the database.

### Clarify Mode

When Luna needs specific information before proceeding, she enters "Clarify Mode". You'll see a prompt explaining what she's waiting for and an example of a valid answer. You can:

- **Answer directly** — "Sabitek"
- **Skip a field** — Say "skip"
- **Cancel the whole thing** — Say "cancel" or "abort"

### Quick Action Chips

Below the message input are suggested quick actions. Click them to pre-populate a message:
- "Create task"
- "Weekly review"
- "Who missed check-in?"
- Other context-aware suggestions

### Guided Playbooks

Luna can run multi-step guided workflows called **Playbooks**. Example: **Weekly Review**

Steps:
1. "How many tasks did you complete this week?"
2. "Any blockers or challenges?"
3. "Send a progress update email" (auto-drafts and sends)
4. Summary of the week

Use:
- **"next"** or **"ok"** — Move to the next step
- **"skip"** — Skip the current step
- **"abort"** — Cancel the playbook

A progress bar shows which step you're on.

### Conversation History

Luna remembers the last 8 messages in your current session. This allows multi-turn conversations ("it" and "that" refer back to previous context).

### Confidence & Safety

- If Luna is not confident about what you meant (confidence < 40%), she will ask you to rephrase rather than guessing wrong.
- Luna never executes actions automatically — every action requires your explicit confirmation.
- Your messages are capped at 2000 characters and sanitised before processing.

### Luna Telemetry

Luna logs anonymised usage data (intent types, tool execution counts, errors) to help improve accuracy. No message content is stored permanently.

---

## 18. Administration (Control Tower)

**Route**: `/admin`

> **Access**: Admins and Super Admins only.

### Admin Dashboard

Overview of system health:
- User count
- Recent system events
- Error rates

### User Management

**Route**: `/admin/users`

Full list of all platform users. Admin actions:
- **Create User** — `/admin/users/new` — Set email, name, role, temporary password
- **Edit User** — `/admin/users/[id]` — Modify profile, role, group memberships
- **Reset Password** — Force a password reset for a user
- **Delete User** — Permanently remove a user account (irreversible — confirm carefully)

### Group Management

**Route**: `/admin/groups`

Manage access groups:
- `shared_mail_admin` — Access to the Shared Mail module
- Radar group — Add/remove members, set roles (admin / editor / viewer)

### Hierarchy Management

**Route**: `/admin/hierarchy`

Configure the reporting structure:
- Assign managers to team members
- Build the org chart
- This affects who managers can see in team reports and check-in views

### Cron Jobs (Automated Tasks)

Two daily automated tasks run via Vercel:

| Job | Time (UTC) | What it Does |
|---|---|---|
| **Opportunity Radar Scan** | 06:00 daily | Fetches all active sources, classifies new opportunities via Claude AI, inserts results |
| **Notification Summary** | 08:00 daily | Sends daily digest of overdue tasks, upcoming deadlines, and check-in reminders |

These run automatically. Admins can also trigger the Radar Scan manually from the Radar module.

---

## 19. Settings

**Route**: `/settings`

Personal settings for your account.

### Profile Settings

- **Full Name** — Display name across the platform
- **Username** — Your unique handle
- **Avatar** — Profile photo

### Security

- **Change Password** — Update your login password
- If `must_change_password` is set by an admin, you are prompted on next login

### Notification Preferences

Configure which email/in-app notifications you receive.

---

## 20. User Roles & Permissions

### Platform Roles

| Role | Description |
|---|---|
| **Member** | Standard user. Access to own tasks, programmes they're a member of, calendar, messaging, check-ins, CRM, Drive. |
| **Manager** | All Member access + Team directory, team check-in view, can create users, can manage hierarchy relationships. |
| **Admin** | All Manager access + Control Tower (user management, group management, hierarchy). Can perform all administrative functions. |
| **Super Admin** | All Admin access + full system configuration. Highest privilege level. |

### Opportunity Radar Roles

These are separate from platform roles and are managed per-user in the Radar Group.

| Radar Role | Permissions |
|---|---|
| **Viewer** | Read-only access to opportunities and pipeline |
| **Editor** | Viewer + can update opportunity stages, add manual opportunities |
| **Admin** | Editor + can manage sources, trigger manual scans, manage group membership |

> **Note**: Platform Admins and Super Admins automatically receive Radar Admin access even without a radar group entry.

### Feature Access Summary

| Feature | Member | Manager | Admin | Super Admin |
|---|---|---|---|---|
| Dashboard | Yes | Yes | Yes | Yes |
| Programmes (view) | Yes | Yes | Yes | Yes |
| Programmes (create/edit) | Yes | Yes | Yes | Yes |
| Tasks (own) | Yes | Yes | Yes | Yes |
| Tasks (all team) | No | Yes | Yes | Yes |
| CRM (view) | Yes | Yes | Yes | Yes |
| CRM (create/edit) | Yes | Yes | Yes | Yes |
| Team Directory | No | Yes | Yes | Yes |
| Calendar | Yes | Yes | Yes | Yes |
| Messaging | Yes | Yes | Yes | Yes |
| Shared Mail | Group only | Group only | Group only | Yes |
| Opportunity Radar | Group only | Group only | Group + Admin | Yes |
| Activity (own) | Yes | Yes | Yes | Yes |
| Activity (team) | No | Yes (reports) | Yes | Yes |
| Analytics | Yes | Yes | Yes | Yes |
| Reports | Yes | Yes | Yes | Yes |
| Drive | Yes | Yes | Yes | Yes |
| Control Tower | No | No | Yes | Yes |
| User Management | No | No | Yes | Yes |
| Luna AI | Yes | Yes | Yes | Yes |

---

## 21. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+K` / `Ctrl+K` | Open global search |
| `Cmd+L` / `Ctrl+L` | Open/close Luna AI drawer |

---

## 22. Data Reference

### Task Status Reference

| Value | Display Label | Colour |
|---|---|---|
| `todo` | To Do | Grey |
| `in_progress` | In Progress | Blue |
| `done` | Done | Green |
| `blocked` | Blocked | Red |

### Task Priority Reference

| Value | Display Label | Colour |
|---|---|---|
| `low` | Low | Light grey |
| `medium` | Medium | Yellow |
| `high` | High | Orange |
| `urgent` | Urgent | Red |

### Programme Status Reference

| Value | Display Label | Colour |
|---|---|---|
| `draft` | Draft | Grey |
| `active` | Active | Green |
| `paused` | Paused | Yellow |
| `completed` | Completed | Blue |
| `archived` | Archived | Dark grey |

### Opportunity Type Reference

| Value | Display Label |
|---|---|
| `grant` | Grant |
| `partnership` | Partnership |
| `corporate_training` | Corporate Training |
| `rfp` | RFP |
| `award` | Award |
| `fellowship` | Fellowship |
| `other` | Other |

### Opportunity Stage Reference

| Value | Display Label | Colour |
|---|---|---|
| `new` | New | Blue |
| `reviewing` | Reviewing | Yellow |
| `preparing` | Preparing | Orange |
| `submitted` | Submitted | Purple |
| `shortlisted` | Shortlisted | Teal |
| `awarded` | Awarded | Green |
| `rejected` | Rejected | Red |
| `expired` | Expired | Grey |
| `archived` | Archived | Dark grey |

### Stakeholder Engagement Reference

| Level | Trigger | Colour |
|---|---|---|
| **Hot** | Last interaction ≤ 14 days | Green |
| **Warm** | Last interaction 15–30 days | Yellow |
| **Cooling** | Last interaction 31–60 days | Orange |
| **Cold** | Last interaction 61+ days or never | Red |

### Stakeholder Programme Roles

| Role | Description |
|---|---|
| **Funder** | Provides financial support |
| **Technical Partner** | Provides technical expertise |
| **Implementing Partner** | Delivers programme activities |
| **Evaluator** | Assesses programme outcomes |
| **Beneficiary** | Receives programme services |
| **Advisor** | Provides strategic guidance |

---

## 23. Frequently Asked Questions

**Q: I can't see the Opportunity Radar in the sidebar. Why?**
A: Access is controlled by your group membership. Contact your admin and ask to be added to the Radar group.

**Q: I can't see Shared Mail. Why?**
A: You need to be in the `shared_mail_admin` group. Ask an admin to add you.

**Q: Can I use Luna on mobile?**
A: Yes. The Luna button is accessible on mobile via the drawer panel. The keyboard shortcut (`Cmd+L`) does not apply on mobile.

**Q: What happens if Luna misunderstands me?**
A: Luna will ask you to rephrase if she's unsure. She will never take action without showing a preview card first, so you can always cancel before anything is committed.

**Q: How often does the Opportunity Radar auto-scan?**
A: Every day at 06:00 UTC. Radar admins can also trigger an immediate scan using the **Scan Now** button.

**Q: Can I delete a task?**
A: Deletion is an admin-level action. Standard users can move tasks to **Archived** status. Contact an admin for permanent deletion.

**Q: How do I link a stakeholder to a programme?**
A: Open the stakeholder's detail page (in CRM), go to the **Linked Programmes** tab, and click **Link to Programme**. Select the programme and assign a role.

**Q: Can I export CRM data?**
A: Yes. On the CRM directory page, click the **Export CSV** button. It downloads all stakeholders as a `.csv` file.

**Q: What does "Confidence Score" mean on an opportunity?**
A: It's the AI's certainty (0–100%) that it correctly classified the opportunity. Higher scores indicate more reliable classification. Below ~40%, review the raw source content manually.

**Q: How do I reset someone's password?**
A: Admins can go to **Control Tower → Users**, select the user, and click **Reset Password**. The user will be prompted to change it on next login.

**Q: What is the Pipeline Value on the Radar dashboard?**
A: It's the sum of the maximum funding amounts of all active (non-archived/non-rejected) opportunities in the system. It gives a sense of the total funding potential currently being tracked.

**Q: Can I undo an action Luna took?**
A: Luna always requires your explicit confirmation before executing. Once confirmed and executed, changes are standard database records. You can manually revert them (e.g., change task status back, or delete a task you accidentally created).

**Q: How does engagement scoring work for stakeholders?**
A: It's automatically calculated based on the most recent interaction date logged in that stakeholder's Interaction History. Keep interaction logs up to date for accurate scoring.

---

*Document generated: February 2026*
*For internal use and end-user documentation basis*
*Product: MoonDesk | Organisation: Tek4All*
