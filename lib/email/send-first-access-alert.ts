import { resend } from './resend-client';
import { prisma } from '@/lib/prisma';
export async function sendFirstAccessAlert(noticeId: string) {
  try {
    const notice = await prisma.notice.findUnique({ where: { id: noticeId }, include: { service: true } });
    if (!notice) return;
    await resend.emails.send({
      from: 'EPS <noreply@eps.app>',
      to: (notice as any).service?.recipientEmail ?? '',
      subject: `EPS Notice First Accessed: ${notice.caseRef}`,
      text: `Notice ref ${notice.caseRef} was first viewed by the recipient.`,
    });
  } catch (err) { console.error('sendFirstAccessAlert', err); }
}
