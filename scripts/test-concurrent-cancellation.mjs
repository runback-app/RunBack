import assert from 'node:assert/strict';
import pg from 'pg';

export async function verifyConcurrentCancellation(admin, connectionString) {
  const scheduler = new pg.Client({ connectionString, application_name: 'runback-qa-scheduler' });
  const stopper = new pg.Client({ connectionString, application_name: 'runback-qa-stopper' });
  await scheduler.connect(); await stopper.connect();
  try {
    const { rows: [series] } = await admin.query(`insert into public.run_series(crew_id,court_id,title,weekdays,local_time,starts_on)
      select id,court_id,'QA concurrent cancellation',array[0,1,2,3,4,5,6],'18:00',current_date+1 from public.crews limit 1 returning id`);
    await admin.query('delete from public.runs where series_id=$1', [series.id]);
    // A scheduler already inserting dates must complete before the stop cancels them.
    await scheduler.query('begin');
    await scheduler.query("set local statement_timeout='5s'");
    await scheduler.query('select private.materialize_runs()');
    await stopper.query('begin');
    await stopper.query("set local statement_timeout='5s'");
    let settled = false;
    const pendingStop = stopper.query('update public.run_series set active=false where id=$1', [series.id])
      .finally(() => { settled = true; });
    const deadline = Date.now() + 3000;
    let blocked = false;
    while (Date.now() < deadline && !settled) {
      const { rows } = await admin.query("select 1 from pg_stat_activity where application_name='runback-qa-stopper' and wait_event_type='Lock'");
      if (rows.length) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert(blocked, 'Stop should wait for the scheduler-held series lock');
    await scheduler.query('commit');
    await pendingStop;
    await stopper.query('commit');
    const activeDates = async () => Number((await admin.query('select count(*) n from public.runs where series_id=$1 and not cancelled', [series.id])).rows[0].n);
    assert.equal(await activeDates(), 0, 'Dates inserted by the overlapping scheduler must be cancelled');

    // A stop already holding its lock must be skipped by the scheduler.
    await admin.query('update public.run_series set active=true where id=$1', [series.id]);
    await admin.query('delete from public.runs where series_id=$1', [series.id]);
    await stopper.query('begin');
    await stopper.query('update public.run_series set active=false where id=$1', [series.id]);
    await scheduler.query('begin');
    await scheduler.query("set local statement_timeout='3s'");
    await scheduler.query('select private.materialize_runs()');
    await scheduler.query('commit');
    await stopper.query('commit');
    await admin.query('select private.materialize_runs()');
    assert.equal(await activeDates(), 0, 'A scheduler must not recreate dates on a stopped series');
    console.log('PASS concurrent scheduler/stop, both lock orderings');
  } finally {
    await scheduler.query('rollback').catch(() => undefined);
    await stopper.query('rollback').catch(() => undefined);
    await scheduler.end(); await stopper.end();
  }
}
