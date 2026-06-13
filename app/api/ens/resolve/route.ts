import { NextRequest, NextResponse } from 'next/server';
import { resolveENS } from '@/lib/ens/ENSResolver';

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get('input')?.trim();
  if (!input || input.length < 3) {
    return NextResponse.json({ error: 'input required, min 3 chars' }, { status: 400 });
  }
  try {
    const result = await resolveENS(input);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[ENS resolve]', err);
    return NextResponse.json({ error: 'Resolution failed' }, { status: 500 });
  }
}
