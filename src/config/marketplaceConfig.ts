import { MarketplaceConfig } from '../types';

export const DEFAULT_MARKETPLACE_CONFIG: MarketplaceConfig = {
  commissionPercentage: 12, // 12% standard platform commission paid by venue
  depositPercentage: 25, // 25% initial booking deposit paid by customer
  balanceDueDaysBeforeEvent: 14, // 14 days before event date
  freeCancellationHours: 48, // 48-hour free cancellation window post-approval
  payoutScheduleNote: 'Disbursed to venue 3-5 business days post-event completion',
};

/**
 * Calculates marketplace financial distribution for a given gross booking amount.
 * Keeps customer fee at $0 while calculating platform commission and venue net payout.
 */
export function calculateBookingFinancials(
  grossAmount: number,
  config: MarketplaceConfig = DEFAULT_MARKETPLACE_CONFIG,
  eventDateStr?: string
) {
  const depositPercent = config.depositPercentage || 25;
  const commissionPercent = config.commissionPercentage || 12;
  const balanceDueDays = config.balanceDueDaysBeforeEvent || 14;

  const depositAmount = Math.round((grossAmount * depositPercent) / 100);
  const remainingBalance = grossAmount - depositAmount;

  // Platform commission is deducted from venue gross payout
  const platformCommission = Math.round((grossAmount * commissionPercent) / 100);
  const venueNetPayout = grossAmount - platformCommission;

  // Calculate final balance due date if eventDateStr provided
  let finalBalanceDueDate: string | undefined = undefined;
  if (eventDateStr) {
    try {
      const eventDate = new Date(eventDateStr);
      if (!isNaN(eventDate.getTime())) {
        const dueDate = new Date(eventDate);
        dueDate.setDate(dueDate.getDate() - balanceDueDays);
        finalBalanceDueDate = dueDate.toISOString().split('T')[0];
      }
    } catch (e) {
      // Fallback
    }
  }

  return {
    grossAmount,
    depositPercentage: depositPercent,
    depositAmount,
    remainingBalance,
    finalBalance: remainingBalance,
    finalBalanceDueDate,
    commissionPercentage: commissionPercent,
    platformCommission,
    venueNetPayout,
    balanceDueDaysBeforeEvent: balanceDueDays,
  };
}
