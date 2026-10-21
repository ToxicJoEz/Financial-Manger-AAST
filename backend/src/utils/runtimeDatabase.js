// Validate configuration only. PostgreSQL data is never copied or reset on startup.
export function prepareRuntimeDatabase() {
  const value = process.env.DATABASE_URL;
  if (!value || !/^postgres(ql)?:\/\//.test(value)) throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  // CLI uses DIRECT_URL to bypass poolers; local connections may use the same URL.
  process.env.DIRECT_URL ||= value;
  return value;
}
