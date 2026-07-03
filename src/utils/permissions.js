/**
 * permissions.js — Single source of truth for Role-Based Access Control (RBAC)
 *
 * HOW JWT AUTHORIZATION WORKS IN THIS APP
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. User logs in  →  server builds a JWT with claims: { sub, role, permissions }
 * 2. Client stores the JWT and sends it on every request as:
 *      Authorization: Bearer <token>
 * 3. `protect` middleware verifies the JWT signature (no DB hit needed for auth).
 *    It reads role & permissions directly from the token claims.
 * 4. `checkPermission('quiz:create')` middleware checks the permissions array
 *    in req.user — again, no DB hit.
 * 5. DB is only queried to get the full user object (name, grade, etc.) when
 *    the handler actually needs it.
 *
 * WHY PUT PERMISSIONS IN THE TOKEN?
 * • Stateless — the server doesn't need to query DB or a cache on every request.
 * • Fast     — authorization is a simple array.includes() on the decoded token.
 * • Portable — any microservice that knows the JWT_SECRET can authorize requests.
 *
 * TRADE-OFF: if a role's permissions change, existing tokens keep the old
 * permissions until they expire (15 min in this app — acceptable).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** All permission strings used in the app. */
const PERMISSIONS = {
  // ── Lessons
  LESSON_READ:    'lesson:read',
  LESSON_CREATE:  'lesson:create',
  LESSON_EDIT:    'lesson:edit',
  LESSON_DELETE:  'lesson:delete',
  LESSON_COMPLETE:'lesson:complete',   // mark as done (students)

  // ── Quizzes
  QUIZ_READ:      'quiz:read',
  QUIZ_CREATE:    'quiz:create',
  QUIZ_EDIT:      'quiz:edit',
  QUIZ_DELETE:    'quiz:delete',
  QUIZ_ATTEMPT:   'quiz:attempt',      // take a quiz (students)

  // ── Subjects & Topics
  SUBJECT_READ:   'subject:read',
  SUBJECT_MANAGE: 'subject:manage',    // create / edit / delete

  // ── Users
  USER_READ:      'user:read',
  USER_MANAGE:    'user:manage',       // create / edit / deactivate

  // ── Reports & Analytics
  REPORT_VIEW:    'report:view',

  // ── Badges
  BADGE_VIEW:     'badge:view',
  BADGE_MANAGE:   'badge:manage',

  // ── School admin
  SCHOOL_MANAGE:  'school:manage',
}

/**
 * Role → permissions map.
 * Each role gets exactly the permissions it needs — no more.
 */
const ROLE_PERMISSIONS = {
  student: [
    PERMISSIONS.LESSON_READ,
    PERMISSIONS.LESSON_COMPLETE,
    PERMISSIONS.QUIZ_READ,
    PERMISSIONS.QUIZ_ATTEMPT,
    PERMISSIONS.SUBJECT_READ,
    PERMISSIONS.BADGE_VIEW,
    PERMISSIONS.REPORT_VIEW,      // own progress only
  ],

  parent: [
    PERMISSIONS.LESSON_READ,
    PERMISSIONS.QUIZ_READ,
    PERMISSIONS.SUBJECT_READ,
    PERMISSIONS.BADGE_VIEW,
    PERMISSIONS.REPORT_VIEW,      // child's progress
  ],

  teacher: [
    PERMISSIONS.LESSON_READ,
    PERMISSIONS.LESSON_CREATE,
    PERMISSIONS.LESSON_EDIT,
    PERMISSIONS.LESSON_DELETE,
    PERMISSIONS.QUIZ_READ,
    PERMISSIONS.QUIZ_CREATE,
    PERMISSIONS.QUIZ_EDIT,
    PERMISSIONS.QUIZ_DELETE,
    PERMISSIONS.SUBJECT_READ,
    PERMISSIONS.BADGE_VIEW,
    PERMISSIONS.BADGE_MANAGE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.USER_READ,
  ],

  admin: [
    PERMISSIONS.LESSON_READ,
    PERMISSIONS.LESSON_CREATE,
    PERMISSIONS.LESSON_EDIT,
    PERMISSIONS.LESSON_DELETE,
    PERMISSIONS.QUIZ_READ,
    PERMISSIONS.QUIZ_CREATE,
    PERMISSIONS.QUIZ_EDIT,
    PERMISSIONS.QUIZ_DELETE,
    PERMISSIONS.SUBJECT_READ,
    PERMISSIONS.SUBJECT_MANAGE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.BADGE_VIEW,
    PERMISSIONS.BADGE_MANAGE,
    PERMISSIONS.REPORT_VIEW,
  ],

  school_admin: [
    PERMISSIONS.LESSON_READ,
    PERMISSIONS.LESSON_CREATE,
    PERMISSIONS.LESSON_EDIT,
    PERMISSIONS.LESSON_DELETE,
    PERMISSIONS.QUIZ_READ,
    PERMISSIONS.QUIZ_CREATE,
    PERMISSIONS.QUIZ_EDIT,
    PERMISSIONS.QUIZ_DELETE,
    PERMISSIONS.SUBJECT_READ,
    PERMISSIONS.SUBJECT_MANAGE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.BADGE_VIEW,
    PERMISSIONS.BADGE_MANAGE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.SCHOOL_MANAGE,
  ],

  super_admin: Object.values(PERMISSIONS),   // all permissions
}

/**
 * Get the permissions array for a given role.
 * Returns empty array for unknown roles.
 */
const getPermissionsForRole = (role) => ROLE_PERMISSIONS[role] ?? []

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, getPermissionsForRole }
