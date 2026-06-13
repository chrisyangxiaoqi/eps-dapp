import { resend } from './resend-client';
import { prisma } from '@/lib/db';

/**
 * First-access alert email (T-404). Notifies the service owner the first time a
 * recipient opens their notice. Sent to the org's `ownerEmail`; skipped when the
 * org has not supplied one. Fire-and-forget — failures are logged, never thrown.
 */
export async function sendFirstAccessAlert(noticeId: string) {
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
      subject: `EPS Notice First Accessed: ${notice.caseCaption}`,
      text: `Notice for ${notice.caseCaption} was first viewed by the recipient.`,
    });
  } catch (err) { console.error('sendFirstAccessAlert', err); }
}
