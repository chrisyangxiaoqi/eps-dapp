import { prisma } from "@/lib/db";

/**
 * The subset of a {@link ServiceRequest} shown on the public notice cover sheet
 * (T-401). Deliberately narrow: no document bytes or storage key refs ever
 * reach the public page (hard rule #3). The caption/party fields ARE shown —
 * that is the cover sheet's purpose: putting the recipient on notice.
 */
export interface NoticeView {
  id: string;
  caseCaption: string;
  plaintiffName: string;
  defendantName: string;
  recipientWallet: string;
  status: string;
  txSignature: string | null;
  blockTime: Date | null;
  noticeToken: string | null;
}

/** A 128-bit notice token is 32 lowercase hex chars (see `lib/intake.ts`). */
const TOKEN_RE = /^[0-9a-f]{32}$/;

/**
 * Look up a service request by its public notice token, case-insensitively.
 *
 * Notice tokens are generated as lowercase hex at intake, so we normalise the
 * incoming token to lowercase and match exactly on the unique index — a link
 * resolves regardless of the casing a user types or a mail client mangles. We
 * also charset/length-guard the token before touching the DB, so malformed or
 * oversized input is rejected as "not found" rather than used to probe.
 *
 * Returns `null` when there is no match; the caller renders a 404.
 */
export async function loadNotice(token: string): Promise<NoticeView | null> {
  const normalized = token.trim().toLowerCase();
  if (!TOKEN_RE.test(normalized)) return null;

  return prisma.serviceRequest.findUnique({
    where: { noticeToken: normalized },
    select: {
      id: true,
      caseCaption: true,
      plaintiffName: true,
      defendantName: true,
      recipientWallet: true,
      status: true,
      txSignature: true,
      blockTime: true,
      noticeToken: true,
    },
  });
}
