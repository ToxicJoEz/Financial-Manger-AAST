# AAST Finance Manager — Master Project Roadmap

> [!NOTE]
> Consolidated authoritative project roadmap, incorporating backend privacy, authentication hardening, payroll integrity, student management, and production readiness.

---

### 1. 🛡️ Financial Privacy & Sensitive Data Exposure
- [x] **Hide hourly rates from junior (`user`) role:**
  - Strip hourly rates and financial figures from `/courses` and `/instructors` API responses when `req.user.role === 'user'`.
  - Ensure the frontend hides rate fields and earnings on cards, breakdown tables, and details when logged in as a normal user.
- [x] **Sanitize user responses:**
  - Exclude password hashes, tokens, and sensitive fields from nested user objects (e.g. submitter/resolver in pending assignments and user status/role update responses).

---

### 2. 🔐 Authentication Hardening
- [x] **Rate Limiting & Admin Unlock:** 15 failed login attempts in 10 minutes lock the account; admins and mods can view locked accounts and unlock them with a dedicated "Unlock" button in Team & Access (`/users`).
- [x] **JWT Secret Security:** Removed insecure hardcoded fallback secrets (`'supersecretjwtkey'`); generated and enforced strong cryptographically random `JWT_SECRET` in `.env` and runtime startup checks.
- [x] **Strict Role Validation:** Enforced strict validation of allowed role values (`admin`, `mod`, `user`) during user registration, role updates, and SSO auto-provisioning/sync.
- [x] **Permanent Root Administrator:** Guaranteed `main-admin` (password initialized from private bcrypt configuration) is always existing, active, unbanned, and an admin across restarts; protected from deactivation, banning, and role demotion.

---

### 3. ⚖️ Assignment Processing & Workflow Reliability
- [x] **Atomic Transactions:** Wrapped assignment approvals, course instructor mutations, and notification updates in a Prisma `$transaction` to prevent partial or inconsistent states.
- [x] **Concurrency Guards:** Implemented atomic status transition guards (`updateMany` with `status: 'PENDING'`) preventing double-approvals and race condition conflicts.
- [x] **Complete Instructor Removal Workflow:**
  - Added `type: 'ASSIGN' | 'REMOVE'` on `PendingAssignment` in Prisma schema.
  - Enabled junior users to submit removal requests through the UI without crashing notifications or requiring hourly rates.
  - Implemented approval handler that deletes the instructor from `CourseInstructor` upon approval.
- [x] **Full Assignment Audit Trail:** Logged approvals, rejections, and user request cancellations in `SystemLog` with detailed descriptions.

---

### 4. 💰 Payroll Validation & Data Integrity
- [x] **Input Constraints:** Enforced finite non-negative numbers for hourly rates, teaching hours, and course total hours in creation, editing, and completion endpoints.
- [x] **Complete Hour Distribution Validation:** Validated that the sum of distributed instructor hours strictly matches total course hours, with live allocation counters in the UI.
- [x] **Assignment Ownership Verification:** Verified that every supplied `courseInstructorId` belongs to the target course and that every assigned instructor receives an allocation.
- [x] **Atomic Course Completion & Reversion:** Course completion (`isFinished`, `totalHours`, `payrollMonth`, and each instructor's `hoursTaught`) and course reversion now execute inside atomic `prisma.$transaction` calls.
- [x] **Historical Payroll Preservation:** Protected completed and paid courses from destructive deletion, and blocked deletion of instructors with completed payroll history.

---

### 5. 📝 Comprehensive Audit Logging
- [x] **Last Login Tracking:** Recorded `lastLogin` timestamp on the `User` model upon successful password login and SSO session creation; surfaced in Team & Access (`/users`).
- [x] **Missing Events:** Logged instructor profile updates, rate changes, student management actions, and assignment reviews in `SystemLog`.
- [x] **Before/After Diffing:** Captured previous vs new values in the audit log descriptions for user role/status updates and critical financial alterations.
- [x] **Resilient Logging:** Audited operations safely with structured fallback handling to preserve critical security operations.

---

### 6. 🎓 Global Student Management
- [x] **Student Schema:** Created Prisma model for `Student` (`id`, `name`, `mobile`, `registrationNumber` @unique, `createdAt`, `updatedAt`).
- [x] **Student CRUD APIs:** Implemented `/api/students` for listing with search, creating, updating, and deleting students with audit logging.
- [x] **Students Directory Page:** Built responsive **Students** directory page (`/students`) in the frontend following `//tailwind-scss` separation, featuring search, stats, and custom Add/Edit/Delete modals.
- [x] **Integrity & Uniqueness:** Enforced unique registration IDs with duplicate collision checks and open access for all authenticated roles as requested.

---

### 7. 💳 Student Course Enrollment & Payment Tracking
- [x] **Course Fee Model:** Added `courseFee` field to `Course` in Prisma schema, integrated with creation, updating, and revenue calculations.
- [x] **Enrollment Join Model:** Created `Enrollment` model linking `Student` and `Course` with `amountPaid`, `customFee` (for fee removal/scholarship or custom discount), and `@@unique([courseId, studentId])`.
- [x] **Enrollment & Payment APIs:** Built endpoints (`GET /api/courses/:id/enrollments`, `POST`, `PUT`, `DELETE`) with live status calculations (Paid, Partial, Unpaid, Exempt) and audit trail logging in `SystemLog`.
- [x] **Noticeable Removal Warning Popup:** Created high-visibility custom modal warning preventing accidental deletion of students with active financial records (`amountPaid > 0`).

---

### 8. 📊 Student Integration in Course Views
- [x] **Card Badges & Tuition Meter:** Enrolled student count badge (`🎓 X Students`) rendered on cards and in the ledger view; manager-only tuition collection progress meter (`Collected / Expected EGP`) with complete privacy masking for junior users.
- [x] **Course Details Roster & Search:** Live student search, status filter pills (`All`, `Paid`, `Partial`, `Unpaid`, `Exempt`), and role-aware roster showing student names, registration numbers, and operational payment statuses.
- [x] **Strict Junior Financial Confidentiality:** Completely stripped all tuition fees, collected totals, remaining balances, and enrollment payment fields for `user` role across backend responses and frontend views.

---

### 9. 📑 Customizable Excel Exports
- [x] **Excel Export Engine:** Build customizable Excel (.xlsx) export functionality alongside the existing PDF generator.
- [x] **Filterable & Selectable Fields:** Allow managers to filter by branch, course, date range, or payment status and pick desired export columns.

---

### 10. Instructor payments after completion only
- **Decision:** No interim or milestone payments. Instructor payroll may only be marked paid after the course is finished.

---

### 11. Outstanding Payment Views
- [x] **Tuition outstanding:** Courses with remaining student tuition, visible to all staff. Retained financial records count; archived finances are excluded.
- [x] **Instructor payments due:** Completed courses with positive unpaid instructor earnings, visible only to admins/mods. Existing payroll views provide settlement actions.
- **Decision:** No automated reminders or reminder notifications.

---

### 12. 🚀 Production Setup & Codebase Hygiene

**Deferred by user decision; do not implement now.**
- [ ] **Environment Configuration:** Replace hardcoded `localhost:5000` URLs with `VITE_API_URL` environment variables.
- [ ] **Production CORS:** Lock down CORS in `server.js` to authorized origins.
- [ ] **Database Backups:** Establish automated backup, migration, and restore procedures for the SQLite database.
- [ ] **Automated Tests:** Add regression tests for permissions, payroll math, assignment approval, and auth flows.
- [ ] **Clean Documentation:** Replace default template README with comprehensive system documentation.
