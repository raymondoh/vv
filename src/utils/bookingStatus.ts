import { VenueBookingStatus, MarketplaceConfig, ChecklistItem } from '../types';

/**
 * Canonical booking status lifecycle:
 * requested → venue accepts → deposit_due
 * deposit_due → customer pays deposit → confirmed
 * confirmed → milestone reached → final_payment_due
 * final_payment_due → balance paid → fully_paid
 * fully_paid → event completed → completed
 * 
 * Declining a request produces: declined
 * Cancelling at any eligible stage produces: cancelled
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<VenueBookingStatus, VenueBookingStatus[]> = {
  requested: ['deposit_due', 'declined', 'cancelled'],
  deposit_due: ['confirmed', 'declined', 'cancelled'],
  confirmed: ['final_payment_due', 'cancelled'],
  final_payment_due: ['fully_paid', 'cancelled'],
  fully_paid: ['completed'],
  completed: [],
  cancelled: [],
  declined: [],
};

export function isValidStatusTransition(
  from: VenueBookingStatus,
  to: VenueBookingStatus
): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export interface StatusDisplayInfo {
  customerLabel: string;
  venueLabel: string;
  adminLabel: string;
  badgeClass: string;
  description: string;
}

export function getStatusDisplay(status: VenueBookingStatus): StatusDisplayInfo {
  switch (status) {
    case 'requested':
      return {
        customerLabel: 'Booking requested',
        venueLabel: 'New Request — Pending Review',
        adminLabel: 'Requested',
        badgeClass: 'bg-stone-100 text-[#26343D] border-[#DDD8CF]',
        description: 'Waiting for venue host to verify calendar and approve request.',
      };
    case 'deposit_due':
      return {
        customerLabel: 'Venue approved — deposit due',
        venueLabel: 'Approved — Deposit Due from Client',
        adminLabel: 'Deposit Due',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        description: 'Venue confirmed availability. Deposit required to secure date.',
      };
    case 'confirmed':
      return {
        customerLabel: 'Booking confirmed',
        venueLabel: 'Deposit Paid — Booking Confirmed',
        adminLabel: 'Confirmed (Deposit Paid)',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        description: 'Deposit paid and date locked on venue calendar.',
      };
    case 'final_payment_due':
      return {
        customerLabel: 'Final payment due',
        venueLabel: 'Final Balance Due from Client',
        adminLabel: 'Final Payment Due',
        badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
        description: 'Final balance payment is due prior to event date.',
      };
    case 'fully_paid':
      return {
        customerLabel: 'Fully paid',
        venueLabel: 'Fully Paid — Ready for Event',
        adminLabel: 'Fully Paid',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        description: 'All payments completed. Ready for event execution.',
      };
    case 'completed':
      return {
        customerLabel: 'Event completed',
        venueLabel: 'Event Completed — Disbursed',
        adminLabel: 'Completed',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        description: 'Event concluded successfully.',
      };
    case 'cancelled':
      return {
        customerLabel: 'Cancelled',
        venueLabel: 'Booking Cancelled',
        adminLabel: 'Cancelled',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        description: 'Booking was cancelled.',
      };
    case 'declined':
      return {
        customerLabel: 'Venue declined request',
        venueLabel: 'Declined by Venue',
        adminLabel: 'Declined',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
        description: 'Venue host was unable to accommodate this date or request.',
      };
    default:
      return {
        customerLabel: status,
        venueLabel: status,
        adminLabel: status,
        badgeClass: 'bg-stone-100 text-stone-700 border-stone-200',
        description: '',
      };
  }
}

/**
 * Return status-aware deposit wording and styling for customer-facing views:
 * - requested: "Not due yet" (or "If approved") — never "Due"
 * - deposit_due: "Due"
 * - confirmed / final_payment_due / fully_paid / completed: "Paid"
 * - declined / cancelled: "Cancelled" / "Not applicable" (no implication of payment due)
 */
export function getDepositStatusDisplay(status: VenueBookingStatus): {
  label: string;
  badgeClass: string;
  isActionable: boolean;
} {
  switch (status) {
    case 'requested':
      return {
        label: '(Not due yet)',
        badgeClass: 'text-[#66737A]',
        isActionable: false,
      };
    case 'deposit_due':
      return {
        label: '(Due)',
        badgeClass: 'text-[#A86445]',
        isActionable: true,
      };
    case 'confirmed':
    case 'final_payment_due':
    case 'fully_paid':
    case 'completed':
      return {
        label: '(Paid)',
        badgeClass: 'text-emerald-700',
        isActionable: false,
      };
    case 'declined':
      return {
        label: '(Declined)',
        badgeClass: 'text-[#66737A]',
        isActionable: false,
      };
    case 'cancelled':
      return {
        label: '(Cancelled)',
        badgeClass: 'text-[#66737A]',
        isActionable: false,
      };
    default:
      return {
        label: '',
        badgeClass: 'text-[#26343D]',
        isActionable: false,
      };
  }
}

/**
 * Return status-aware final balance wording and styling for customer-facing views
 */
export function getFinalBalanceStatusDisplay(status: VenueBookingStatus): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'fully_paid':
    case 'completed':
      return {
        label: '(Paid)',
        badgeClass: 'text-emerald-700 font-semibold',
      };
    case 'final_payment_due':
      return {
        label: '(Due)',
        badgeClass: 'text-orange-800 font-semibold',
      };
    case 'requested':
    case 'deposit_due':
    case 'confirmed':
      return {
        label: '',
        badgeClass: 'text-[#26343D]',
      };
    case 'declined':
    case 'cancelled':
      return {
        label: '(N/A)',
        badgeClass: 'text-[#66737A]',
      };
    default:
      return {
        label: '',
        badgeClass: 'text-[#26343D]',
      };
  }
}

/**
 * Dynamically generates checklist items adhering to the active MarketplaceConfig
 */
export function generateBookingChecklist(
  config: MarketplaceConfig,
  eventDate: string
): ChecklistItem[] {
  const depositPct = config.depositPercentage || 25;
  const balanceDays = config.balanceDueDaysBeforeEvent || 14;

  return [
    {
      id: `chk-${Date.now()}-1`,
      text: 'Explore venue 4K walkthrough and architectural floor plans',
      completed: true,
      category: 'Inspection',
    },
    {
      id: `chk-${Date.now()}-2`,
      text: 'Venue booking request submitted to coordinator',
      completed: true,
      category: 'Contract & Payment',
    },
    {
      id: `chk-${Date.now()}-3`,
      text: 'Awaiting venue host review & date confirmation',
      completed: false,
      category: 'Contract & Payment',
    },
    {
      id: `chk-${Date.now()}-4`,
      text: `Pay initial deposit (${depositPct}%) once venue accepts`,
      completed: false,
      category: 'Contract & Payment',
    },
    {
      id: `chk-${Date.now()}-5`,
      text: 'Finalize catering, AV staging & run-of-show schedule',
      completed: false,
      category: 'Catering & AV',
    },
    {
      id: `chk-${Date.now()}-6`,
      text: 'Submit vendor COI (Certificate of Insurance) to venue team',
      completed: false,
      category: 'Logistics',
    },
    {
      id: `chk-${Date.now()}-7`,
      text: `Pay final remaining balance (due ${balanceDays} days prior to event)`,
      completed: false,
      category: 'Contract & Payment',
    },
  ];
}
