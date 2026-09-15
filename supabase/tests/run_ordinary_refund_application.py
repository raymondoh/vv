"""Rollback-only local Supabase tests. Never applies migration history or commits data.
Run from any directory: python3 supabase/tests/run_ordinary_refund_application.py
The actual COMMIT probes install a final abort trigger as an independent safety net.
Requires the existing local Supabase Docker container; performs no provider HTTP.
"""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
COMMAND = ['docker', 'exec', '-i', 'supabase_db_vv', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1']
MIGRATIONS = ['20260915135620_payment_refund_success_reconciliation.sql',
              '20260915152000_refund_verification_context.sql',
              '20260915170000_ordinary_refund_application.sql']


def run(sql):
    return subprocess.run(COMMAND, input=sql, text=True, capture_output=True)


def stack():
    # The local instance may later have approved prerequisites applied. Never replay them.
    result = run("select version from supabase_migrations.schema_migrations;")
    if result.returncode:
        raise RuntimeError(result.stderr)
    if MIGRATIONS[-1][:14] in result.stdout:
        raise RuntimeError('B4 is already applied; this harness is for pre-application rollback validation')
    return 'begin;\n' + ''.join((ROOT / 'supabase/migrations' / name).read_text()
                              for name in MIGRATIONS if name[:14] not in result.stdout)


def main():
    snapshot_sql = """select jsonb_build_object(
'integration',(select to_jsonb(s) from private.payment_integration_settings s),
'genuine',(select to_jsonb(b) from public.bookings b where id='7ca68eab-0fce-46bf-813c-e31f6d354235'),
'bookings',(select count(*) from public.bookings),
'payments',(select count(*) from public.booking_payments),
'refunds',(select count(*) from public.payment_refunds),
'allocations',(select count(*) from public.booking_space_allocations),
'events',(select count(*) from private.payment_provider_events),
'receipts',(select count(*) from private.payment_provider_receipts),
'obligations',(select count(*) from private.payment_refund_obligations),
'history',(select jsonb_agg(to_jsonb(h) order by version) from supabase_migrations.schema_migrations h),
'items',(select count(*) from public.booking_items),
'schedules',(select count(*) from public.booking_payment_schedule),
'audits',(select count(*) from private.audit_events),
'genuine_payments',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.booking_payments p where booking_id='7ca68eab-0fce-46bf-813c-e31f6d354235'),
'disabled_guards',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
 join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and t.tgenabled='D'),
'applications',to_regclass('private.payment_refund_applications'),
'refund_evidence',to_regclass('private.payment_provider_refund_receipts'),
'ordinary_rpc',to_regprocedure('public.apply_ordinary_refund_success(uuid,uuid)'))::text;"""
    before = run(snapshot_sql)
    if before.returncode:
        raise RuntimeError(before.stderr)
    prefix = stack()
    for name in ['ordinary_refund_application.sql', 'ordinary_refund_compatibility.sql']:
        result = run(prefix + (ROOT / 'supabase/tests' / name).read_text() + '\nset constraints all immediate; rollback;')
        if result.returncode:
            raise RuntimeError(name + '\n' + result.stderr)
        print(name, 'PASS', result.stderr.count('NOTICE:  PASS'), 'assertions')

    base = (ROOT / 'supabase/tests/ordinary_refund_application.sql').read_text().split('savepoint before_partials;')[0]
    evidence_free_base = base + """
select pg_temp.ok(not exists(select 1 from private.payment_refund_applications)
 and not exists(select 1 from private.payment_provider_refund_receipts)
 and (select payment_status='succeeded' from public.booking_payments where id=(select pid from fixture)),
 'evidence-free probe begins with collected payment and no refund evidence/applications');
set constraints all immediate; set constraints all deferred;
"""
    base += '\nselect pg_temp.new_refund(1,100); set constraints all immediate; set constraints all deferred;\n'
    safety = """
create temp table never_commit(x integer);
create function pg_temp.never_commit() returns trigger language plpgsql as $$begin
 raise exception 'TEST_SAFETY_ABORT_PRODUCTION_CONSTRAINT_MISSED';end $$;
create constraint trigger never_commit after insert on never_commit
 deferrable initially deferred for each row execute function pg_temp.never_commit();
"""
    ledger = """insert into private.payment_refund_applications(refund_receipt_id,application_kind,ordinary_refund_id,
prior_refunded_minor,resulting_refunded_minor,previous_payment_status,resulting_payment_status,
previous_booking_payment_status,resulting_booking_payment_status)
select eid,'ordinary',id,0,100,'succeeded','partially_refunded','partially_paid','partially_refunded' from requests;"""
    cases = [
        ('ordinary success without application', "update public.payment_refunds set refund_status='succeeded',succeeded_at=clock_timestamp() where id=(select id from requests);", 'Ordinary success requires canonical application'),
        ('application without succeeded request', ledger, 'Ordinary application identity mismatch'),
        ('ordinary applied evidence without application', "update private.payment_provider_refund_receipts set disposition='ordinary_applied' where id=(select eid from requests);", 'Applied evidence requires canonical application'),
        ('application wrong receipt amount', ledger.replace('0,100,', '0,101,') +
         "update public.payment_refunds set refund_status='succeeded',succeeded_at=(select applied_at from private.payment_refund_applications) where id=(select id from requests);"
         + "update private.payment_provider_refund_receipts set disposition='ordinary_applied' where id=(select eid from requests);",
         'Ordinary application identity mismatch'),
        ('evidence-free partial payment', "update public.booking_payments set payment_status='partially_refunded' where id=(select pid from fixture);", 'Payment refund state requires canonical application'),
        ('evidence-free full payment', "update public.booking_payments set payment_status='refunded' where id=(select pid from fixture);", 'Payment refund state requires canonical application'),
        ('partial booking overwritten paid', "select pg_temp.apply(1); update public.bookings set payment_status='paid' where id=(select bid from fixture);", 'Booking refund cumulative accounting mismatch'),
        ('partial booking overwritten refunded', "select pg_temp.apply(1); update public.bookings set payment_status='refunded' where id=(select bid from fixture);", 'Booking refund cumulative accounting mismatch'),
        ('duplicate receipt consumption', ledger + ledger, 'duplicate key value'),
    ]
    for label, mutation, expected in cases:
        test_base = evidence_free_base if label.startswith('evidence-free') else base
        result = run(prefix + test_base + safety + mutation + '\ninsert into never_commit values(1); commit;')
        if not result.returncode or expected not in result.stderr or 'TEST_SAFETY_ABORT_PRODUCTION_CONSTRAINT_MISSED' in result.stderr:
            raise RuntimeError(label + '\n' + result.stderr)
        print('PASS ' + ('immediate uniqueness' if label == 'duplicate receipt consumption' else 'actual COMMIT') + ' rejection:', label)
    after = run(snapshot_sql)
    if after.returncode or after.stdout != before.stdout:
        raise RuntimeError('Rollback residue or shared fixture state changed: ' + after.stdout + after.stderr)
    print('PASS rollback residue: row counts, migration history, objects, guards, integration and genuine booking unchanged')


if __name__ == '__main__':
    main()
