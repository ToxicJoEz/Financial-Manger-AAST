// In-memory tracker for failed login attempts
// 15 failed attempts within 10 minutes triggers a temporary lock
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 15;

const attemptsMap = new Map(); // username.toLowerCase() -> { count, firstAttemptAt, isLocked }

export const isAccountLocked = (username) => {
  if (!username) return false;
  const key = username.trim().toLowerCase();
  const record = attemptsMap.get(key);
  if (!record) return false;

  const now = Date.now();
  // Check if window has expired
  if (now - record.firstAttemptAt > WINDOW_MS) {
    attemptsMap.delete(key);
    return false;
  }

  return record.count >= MAX_ATTEMPTS;
};

export const getRemainingLockMinutes = (username) => {
  if (!username) return 0;
  const key = username.trim().toLowerCase();
  const record = attemptsMap.get(key);
  if (!record) return 0;

  const now = Date.now();
  const elapsed = now - record.firstAttemptAt;
  if (elapsed > WINDOW_MS) {
    attemptsMap.delete(key);
    return 0;
  }
  return Math.ceil((WINDOW_MS - elapsed) / 60000);
};

export const recordFailedAttempt = (username) => {
  if (!username) return;
  const key = username.trim().toLowerCase();
  const now = Date.now();
  const record = attemptsMap.get(key);

  if (!record || now - record.firstAttemptAt > WINDOW_MS) {
    attemptsMap.set(key, {
      count: 1,
      firstAttemptAt: now
    });
  } else {
    record.count += 1;
    attemptsMap.set(key, record);
  }
};

export const recordSuccessfulLogin = (username) => {
  if (!username) return;
  attemptsMap.delete(username.trim().toLowerCase());
};

export const unlockUser = (username) => {
  if (!username) return;
  attemptsMap.delete(username.trim().toLowerCase());
};

export const getLockedUsernames = () => {
  const now = Date.now();
  const locked = new Set();
  for (const [key, record] of attemptsMap.entries()) {
    if (now - record.firstAttemptAt <= WINDOW_MS && record.count >= MAX_ATTEMPTS) {
      locked.add(key);
    } else if (now - record.firstAttemptAt > WINDOW_MS) {
      attemptsMap.delete(key);
    }
  }
  return locked;
};
