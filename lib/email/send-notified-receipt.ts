import { resend } from './resend-client';
import { prisma } from '@/lib/prisma';
export async function sendNotifiedReceipt(noticeId: string) {
  try {
    const notice = await prisma.notice.findUnique({ where: { id: noticeId }, include: { service: true } });
    if (!notice) return;
    await resend.emails.send({
      from: 'EPS <noreply@eps.app>',
      to: (notice as any).service?.recipientEmail ?? '',
      subject: `EPS Notice Served: ${notice.caseRef}`,
      text: `Notice ref ${notice.caseRef} has been served and recorded on-chain.`,
    });
  } catch (err) { console.error('sendNotifiedReceipt', err); }
}
