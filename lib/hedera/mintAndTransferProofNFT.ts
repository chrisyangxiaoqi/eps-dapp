/**
 * lib/hedera/mintAndTransferProofNFT.ts
 *
 * Hedera HTS proof-of-service NFT ROUND-TRIP (issue #148, Fix 4).
 *
 * The Hedera "AI & Agentic Payments" prize requires a real on-chain financial
 * operation — a token transfer, not just an HCS consensus message. This module
 * mints one proof-of-service NFT and TRANSFERS it to a demo "defendant" account
 * on Hedera testnet, returning the transfer transaction id for the audit trail.
 *
 * Flow:
 *   1. Resolve the NFT collection — reuse `HEDERA_NFT_TOKEN_ID` or create a fresh
 *      NON_FUNGIBLE_UNIQUE token (operator = treasury + supply key).
 *   2. Mint 1 NFT with EPS proof metadata (caseId, HCS topic, timestamp).
 *   3. Resolve the defendant — reuse `HEDERA_DEMO_DEFENDANT_ID`, or create a new
 *      testnet account with unlimited auto-association so the transfer lands
 *      without a separate TokenAssociate step.
 *   4. Transfer the minted serial operator → defendant.
 *
 * SERVER-SIDE ONLY. Never import in "use client" components.
 *
 * Credentials come from env (CLAUDE.md hard rule #1 — never hard-coded):
 *   HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY (DER-encoded), HEDERA_NETWORK.
 * Optional: HEDERA_NFT_TOKEN_ID, HEDERA_DEMO_DEFENDANT_ID.
 *
 * Mainnet guard: refuses to run unless HEDERA_ALLOW_MAINNET=true (we never touch
 * mainnet in this project — the operator key controls real value there).
 */

export interface ProofNFTTransferResult {
  /** HTS collection id the NFT belongs to, e.g. "0.0.123456". */
  tokenId: string;
  /** Minted serial number that was transferred. */
  serial: number;
  /** Hedera transaction id of the transfer to the defendant. */
  transferTx: string;
  /** Defendant account the NFT was transferred to. */
  defendantId: string;
  /** True when the defendant account was created on the fly by this call. */
  defendantCreated: boolean;
}

export interface ProofNFTMetadata {
  caseId: string;
  hcsTopicId?: string | null;
  hcsSequenceNumber?: number | null;
}

/**
 * Mint one proof-of-service NFT and transfer it to the demo defendant account.
 * Returns the transfer details, or `null` if Hedera credentials are missing
 * (the caller treats a null as "Hedera not configured" — best-effort, never
 * fatal to delivery; CLAUDE.md: HTS calls wrapped in try/catch).
 *
 * Throws only on an unexpected SDK error AFTER credentials are present, so the
 * caller can log it; callers in the request/worker path MUST wrap this in
 * try/catch so a Hedera failure never blocks confirmation.
 */
export async function mintAndTransferProofNFT(
  meta: ProofNFTMetadata,
): Promise<ProofNFTTransferResult | null> {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKeyStr = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKeyStr) {
    console.warn("[Hedera] mintAndTransferProofNFT: credentials missing; skipping.");
    return null;
  }

  const isMainnet = process.env.HEDERA_NETWORK === "mainnet";
  if (isMainnet && process.env.HEDERA_ALLOW_MAINNET !== "true") {
    throw new Error(
      "Refusing to mint/transfer on Hedera mainnet. Set HEDERA_ALLOW_MAINNET=true to override.",
    );
  }

  const {
    Client,
    PrivateKey,
    AccountId,
    TokenId,
    TokenCreateTransaction,
    TokenMintTransaction,
    TokenType,
    TokenSupplyType,
    TransferTransaction,
    AccountCreateTransaction,
    NftId,
    Hbar,
  } = await import("@hashgraph/sdk");

  const operatorKey = PrivateKey.fromStringDer(operatorKeyStr);
  const operatorAccount = AccountId.fromString(operatorId);
  const client = isMainnet ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorAccount, operatorKey);

  try {
    // (1) Resolve (or create) the NFT collection.
    let tokenId = process.env.HEDERA_NFT_TOKEN_ID
      ? TokenId.fromString(process.env.HEDERA_NFT_TOKEN_ID)
      : null;
    if (!tokenId) {
      const createTx = await new TokenCreateTransaction()
        .setTokenName("EPS Proof of Service")
        .setTokenSymbol("EPSPOS")
        .setTokenType(TokenType.NonFungibleUnique)
        .setSupplyType(TokenSupplyType.Infinite)
        .setInitialSupply(0)
        .setTreasuryAccountId(operatorAccount)
        .setSupplyKey(operatorKey)
        .setAdminKey(operatorKey)
        .freezeWith(client)
        .sign(operatorKey);
      const createReceipt = await (await createTx.execute(client)).getReceipt(client);
      if (!createReceipt.tokenId) throw new Error("Token creation returned no token id.");
      tokenId = createReceipt.tokenId;
      console.log(`[Hedera] Created proof-of-service NFT collection ${tokenId.toString()}`);
    }

    // (2) Mint one NFT carrying the EPS proof metadata.
    //
    // Hedera HTS caps NFT metadata at 100 bytes — a full JSON blob overflows it
    // and the mint receipt comes back METADATA_TOO_LONG. Per the HTS / wallet
    // convention the on-chain metadata is a URI pointing to a JSON document;
    // HashScan fetches it to render the certificate image + attributes for the
    // judge view (issue #161). The URL is ~62 bytes, comfortably under the cap,
    // and a hard truncation guard keeps us safe even if topic/seq grow.
    const hcsTopic = meta.hcsTopicId ?? process.env.HEDERA_HCS_TOPIC_ID ?? "0.0.9225885";
    const hcsSeq = meta.hcsSequenceNumber ?? 0;
    const metaUri =
      "https://eps-dapp.vercel.app/api/nft/meta?topic=" + hcsTopic + "&seq=" + hcsSeq;
    let metadata = Buffer.from(metaUri, "utf8");
    if (metadata.length > 100) {
      metadata = metadata.subarray(0, 100);
    }
    const mintTx = await new TokenMintTransaction()
      .setTokenId(tokenId)
      .addMetadata(metadata)
      .freezeWith(client)
      .sign(operatorKey);
    const mintReceipt = await (await mintTx.execute(client)).getReceipt(client);
    const serial = mintReceipt.serials?.[0]?.toNumber();
    if (serial == null) throw new Error("Mint returned no serial number.");

    // (3) Resolve the defendant account. A configured account is reused as-is
    // (it must have an open auto-association slot or already be associated). When
    // none is configured we create a fresh testnet account with unlimited
    // auto-association so the transfer always lands for the demo.
    let defendantCreated = false;
    let defendantId: InstanceType<typeof AccountId>;
    if (process.env.HEDERA_DEMO_DEFENDANT_ID) {
      defendantId = AccountId.fromString(process.env.HEDERA_DEMO_DEFENDANT_ID);
    } else {
      const newKey = PrivateKey.generateED25519();
      const acctTx = await new AccountCreateTransaction()
        .setKeyWithoutAlias(newKey.publicKey)
        .setInitialBalance(new Hbar(0))
        .setMaxAutomaticTokenAssociations(-1)
        .execute(client);
      const acctReceipt = await acctTx.getReceipt(client);
      if (!acctReceipt.accountId) throw new Error("Account creation returned no account id.");
      defendantId = acctReceipt.accountId;
      defendantCreated = true;
      console.log(`[Hedera] Created demo defendant account ${defendantId.toString()}`);
    }

    // (4) Transfer the minted serial operator → defendant. This is the real
    // on-chain token transfer the bounty requires.
    const transferTx = await new TransferTransaction()
      .addNftTransfer(new NftId(tokenId, serial), operatorAccount, defendantId)
      .freezeWith(client)
      .sign(operatorKey);
    const transferResponse = await transferTx.execute(client);
    await transferResponse.getReceipt(client);
    const transferTxId = transferResponse.transactionId.toString();

    return {
      tokenId: tokenId.toString(),
      serial,
      transferTx: transferTxId,
      defendantId: defendantId.toString(),
      defendantCreated,
    };
  } finally {
    client.close();
  }
}
