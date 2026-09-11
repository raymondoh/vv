import type { HostRow, HostItemRow } from './model';
export const id = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function summary(n = 1): HostRow {
  return { id: id(n), booking_reference: `VV-${n}`, organization_id: id(100), organization_display_name: 'Host organisation', organization_status: 'active',
    venue_id: id(200), venue_name: 'Historical venue', venue_timezone: 'Europe/London', customer_display_name: 'Historical customer', customer_notes: 'Quiet room, please.',
    created_at: '2026-09-11T12:00:00Z', submitted_at: '2026-09-11T12:00:00Z', event_starts_at: '2026-10-01T18:00:00Z', event_ends_at: '2026-10-02T01:00:00Z',
    event_type: 'Dinner', guest_count: 20, booking_status: 'requested', payment_status: 'unpaid', hold_expires_at: null, currency_code: 'GBP',
    customer_total_minor: 50000, marketplace_commission_minor: 5000, venue_net_before_fees_minor: 45000 };
}
export function item(n = 1): HostItemRow {
  return { id: id(n + 1000), booking_id: id(1), space_id: id(2000), space_layout_id: id(3000), sort_order: 0,
    item_starts_at: '2026-10-01T18:00:00Z', item_ends_at: '2026-10-02T01:00:00Z', space_name: 'Historical room', layout_name: 'Historical layout' };
}
