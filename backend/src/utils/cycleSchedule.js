
export function cycleSchedule(body, previous = {}) {
  const result = {};
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (body.venue !== undefined) {
    if (body.venue !== null && typeof body.venue !== 'string') fail('Venue must be text.');
    result.venue = body.venue?.trim() || null;
    if (result.venue?.length > 160) fail('Venue must be 160 characters or fewer.');
  }
  for (const key of ['classStartTime', 'classEndTime']) if (body[key] !== undefined) {
    const value = body[key];
    if (value != null && value !== '' && (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) fail('Choose a valid class time.');
    result[key] = value || null;
  }
  const start = result.classStartTime === undefined ? previous.classStartTime : result.classStartTime;
  const end = result.classEndTime === undefined ? previous.classEndTime : result.classEndTime;
  if (!!start !== !!end) fail('Enter both class start and end times, or leave both empty.');
  if (start && end <= start) fail('Class end time must be after its start time.');
  return result;
}
