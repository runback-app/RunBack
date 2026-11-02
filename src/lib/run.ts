// A full run is 5 on 5, so the meter has 10 spots split into two teams of 5.
export const FULL_RUN = 10;

export type RunMeter = {
  filled: number;
  waiting: number;
  label: string;
};

export function runMeter(players: number): RunMeter {
  const count = Math.max(0, Math.floor(players || 0));
  const filled = Math.min(count, FULL_RUN);
  const waiting = Math.max(count - FULL_RUN, 0);

  let label: string;
  if (count === 0) label = 'Nobody checked in';
  else if (count < FULL_RUN) label = `${FULL_RUN - count} more for 5 on 5`;
  else if (waiting === 0) label = 'Full run';
  else label = `Full run, ${waiting} waiting`;

  return { filled, waiting, label };
}

export function playersHere(count: number): string {
  return count === 1 ? '1 player here' : `${count} players here`;
}
