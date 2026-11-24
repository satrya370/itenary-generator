/** Clock minutes of "HH:MM". Shared by the validator, the preview and the renderer so that "+1" is decided in one place. */
export function minutesOf(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

/**
 * Absolute minutes for each timed activity of one day. A day may pass midnight once: a time that falls from 18:00 or later
 * to before 12:00 is the next day's clock. A second fall, or any other fall, stays a real ordering problem.
 */
export function dayClock(activities: ReadonlyArray<{ time?: string | null }>): Array<number | null> {
  let offset = 0;
  let previous: number | null = null;
  let wrapped = false;
  return activities.map((activity) => {
    if (!activity.time) return null;
    const local = minutesOf(activity.time);
    let current = local + offset;
    if (previous !== null && current < previous && !wrapped && previous - offset >= 18 * 60 && local < 12 * 60) {
      offset += 1440;
      wrapped = true;
      current = local + offset;
    }
    previous = current;
    return current;
  });
}
