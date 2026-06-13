import { resend } from './resend-client';
import { prisma } from '@/lib/db';

/**
 * Served-receipt email (T-404). Notifies the service owner that a notice has
 * been served and recorded on-chain. Sent to the org's `ownerEmail`; skipped
 * when the org has not supplied one. Failures are logged, never thrown.
 */
export async function sendNotifiedReceipt(noticeId: string) {
  try {
    const notice = await prisma.serviceRequest.findUnique({
      where: { id: noticeId },
      select: { caseCaption: true, organization: { select: { ownerEmail: true } } },
    });
    if (!notice) return;
    const to = notice.organization.ownerEmail;
    if (!to) return;
    await resend.emails.send({
      from: 'EPS <noreply@eps.app>',
      to,
      subject: `EPS Notice Served: ${notice.caseCaption}`,
      text: `Notice for ${notice.caseCaption} has been served and recorded on-chain.`,
    });
  } catch (err) { console.error('sendNotifiedReceipt', err); }
}
