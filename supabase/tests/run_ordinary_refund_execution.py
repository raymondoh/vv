"""Rollback-only B4C1 compilation and compatibility. No provider HTTP."""
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[2]
base = runpy.run_path(str(ROOT / 'supabase/tests/run_ordinary_refund_application.py'))
run = base['run']
name = '20260915190000_ordinary_refund_execution.sql'
snapshot = """select jsonb_build_object(
 'history',(select jsonb_agg(to_jsonb(h) order by version) from supabase_migrations.schema_migrations h),
 'integration',(select to_jsonb(s) from private.payment_integration_settings s),
 'genuine',(select to_jsonb(b) from public.bookings b where id='7ca68eab-0fce-46bf-813c-e31f6d354235'),
 'payments',(select count(*) from public.booking_payments),
 'refunds',(select count(*) from public.payment_refunds),
 'bookings',(select count(*) from public.bookings),
 'items',(select count(*) from public.booking_items),
 'schedules',(select count(*) from public.booking_payment_schedule),
 'allocations',(select count(*) from public.booking_space_allocations),
 'events',(select count(*) from private.payment_provider_events),
 'receipts',(select count(*) from private.payment_provider_receipts),
 'obligations',(select count(*) from private.payment_refund_obligations),
 'audit',(select count(*) from private.audit_events),
 'executions',to_regclass('private.ordinary_refund_executions'),
 'ledger',to_regclass('private.payment_refund_applications'),
 'refund_receipts',to_regclass('private.payment_provider_refund_receipts'),
 'guard_modes',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
 'disabled',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and t.tgenabled='D'))::text;"""
before = run(snapshot)
if before.returncode:
    raise RuntimeError(before.stderr)
if name[:14] in before.stdout or '"executions": null' not in before.stdout:
    raise RuntimeError('Expected unapplied B4C1')
prefix = base['stack']() + (ROOT / 'supabase/migrations/20260915180000_ordinary_refund_verification_context.sql').read_text() + (ROOT / 'supabase/migrations' / name).read_text()
fixture = (ROOT / 'supabase/tests/ordinary_refund_application.sql').read_text().split('savepoint before_partials;')[0]
try:
    for test in ['ordinary_refund_execution.sql', 'ordinary_refund_application.sql', 'ordinary_refund_compatibility.sql']:
        body = (fixture if test == 'ordinary_refund_execution.sql' else '') + (ROOT / 'supabase/tests' / test).read_text()
        result = run(prefix + body + '\nset constraints all immediate; rollback;')
        if result.returncode:
            raise RuntimeError(test + '\n' + result.stderr)
        print(test, 'PASS', result.stderr.count('NOTICE:  PASS'), 'assertions')
finally:
    after = run(snapshot)
    if after.returncode or after.stdout != before.stdout:
        raise RuntimeError('Rollback residue or shared fixture changed')
print('PASS rollback: history, objects, rows, guards, integration and genuine booking unchanged')
