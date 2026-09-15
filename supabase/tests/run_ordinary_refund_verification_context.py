"""Rollback-only B4B context tests; no provider HTTP or permanent application."""
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[2]
base = runpy.run_path(str(ROOT / 'supabase/tests/run_ordinary_refund_application.py'))
run = base['run']
name = '20260915180000_ordinary_refund_verification_context.sql'
history = run('select version from supabase_migrations.schema_migrations;')
if history.returncode:
    raise RuntimeError(history.stderr)
if name[:14] in history.stdout:
    raise RuntimeError('Expected pre-application database')
snapshot = """select jsonb_build_object(
 'history',(select jsonb_agg(to_jsonb(h) order by version) from supabase_migrations.schema_migrations h),
 'integration',(select to_jsonb(s) from private.payment_integration_settings s),
 'genuine',(select to_jsonb(b) from public.bookings b where id='7ca68eab-0fce-46bf-813c-e31f6d354235'),
 'payments',(select count(*) from public.booking_payments),
 'refunds',(select count(*) from public.payment_refunds),
 'bookings',(select count(*) from public.bookings),
 'allocations',(select count(*) from public.booking_space_allocations),
 'receipts',(select count(*) from private.payment_provider_receipts),
 'obligations',(select count(*) from private.payment_refund_obligations),
 'audit',(select count(*) from private.audit_events),
 'context',to_regprocedure('public.get_ordinary_refund_verification_context(uuid)'),
 'ledger',to_regclass('private.payment_refund_applications'),
 'refund_receipts',to_regclass('private.payment_provider_refund_receipts'),
 'disabled',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and t.tgenabled='D'))::text;"""
before = run(snapshot)
if before.returncode:
    raise RuntimeError(before.stderr)
fixture = (ROOT / 'supabase/tests/ordinary_refund_application.sql').read_text().split('savepoint before_partials;')[0]
result = run(base['stack']() + (ROOT / 'supabase/migrations' / name).read_text() + fixture
             + (ROOT / 'supabase/tests/ordinary_refund_verification_context.sql').read_text() + '\nrollback;')
after = run(snapshot)
if after.returncode or before.stdout != after.stdout:
    raise RuntimeError('Rollback residue or shared fixture changed')
if result.returncode:
    raise RuntimeError(result.stderr)
print('PASS B4B context:', result.stderr.count('NOTICE:  PASS'), 'assertions')
print('PASS no residue: history, objects, counts, guards, integration, genuine booking unchanged')
