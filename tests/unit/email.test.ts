import { vi, describe, it, expect, beforeEach } from 'vitest';
vi.mock('resend');
// `vi.mock` factories are hoisted above module-scope consts, so the shared spy
// must be created via `vi.hoisted` to exist when the factory runs.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn().mockResolvedValue({ id: 'test' }) }));
vi.mock('../../lib/email/resend-client', () => ({ resend: { emails: { send: mockSend } } }));
vi.mock('@/lib/db', () => ({ prisma: { serviceRequest: { findUnique: vi.fn().mockResolvedValue({ caseCaption: 'REF-001', organization: { ownerEmail: 'test@example.com' } }) } } }));
import { sendNotifiedReceipt } from '../../lib/email/send-notified-receipt';
import { sendFirstAccessAlert } from '../../lib/email/send-first-access-alert';
describe('email helpers', () => {
  beforeEach(() => { mockSend.mockClear(); });
  it('sendNotifiedReceipt calls resend', async () => { await sendNotifiedReceipt('1'); expect(mockSend).toHaveBeenCalledOnce(); });
  it('sendFirstAccessAlert calls resend', async () => { await sendFirstAccessAlert('1'); expect(mockSend).toHaveBeenCalledOnce(); });
});
