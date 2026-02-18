import * as anchor from "@coral-xyz/anchor";
import { BN, Program, Idl } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  Connection,
} from "@solana/web3.js";
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
} from "@solana/spl-token";
import { LiteSVM } from "litesvm";
import assert from "assert";
import idl from "../target/idl/capstone_vesting_vault.json";

// ─── Constants ────────────────────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey(idl.address);
const TOKEN_DECIMALS = 6;
const MINT_AMOUNT = new BN(1_000_000_000); // 1000 tokens (with 6 decimals)
const VEST_AMOUNT = new BN(500_000_000);   // 500 tokens to vest

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a mint, an ATA for the destination, and mints `amount` tokens to it.
 * Returns the mint keypair.
 */
function createMintAndMintTo(
  svm: LiteSVM,
  payer: Keypair,
  destination: PublicKey,
  amount: bigint
): Keypair {
  const mintKp = Keypair.generate();

  // 1. Create + initialize the mint account
  const mintRentLamports = svm.minimumBalanceForRentExemption(BigInt(MintLayout.span));
  const createMintTx = new Transaction();
  createMintTx.recentBlockhash = svm.latestBlockhash();
  createMintTx.feePayer = payer.publicKey;
  createMintTx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKp.publicKey,
      lamports: Number(mintRentLamports),
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mintKp.publicKey,
      TOKEN_DECIMALS,
      payer.publicKey, // mint authority
      null             // freeze authority
    )
  );
  createMintTx.sign(payer, mintKp);
  const mintResult = svm.sendTransaction(createMintTx);
  if ("err" in mintResult) throw new Error(`Create mint failed: ${JSON.stringify(mintResult.err)}`);

  // 2. Create the destination ATA
  const ata = getAssociatedTokenAddressSync(mintKp.publicKey, destination, false, TOKEN_PROGRAM_ID);
  const createAtaTx = new Transaction();
  createAtaTx.recentBlockhash = svm.latestBlockhash();
  createAtaTx.feePayer = payer.publicKey;
  createAtaTx.add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      destination,
      mintKp.publicKey,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  createAtaTx.sign(payer);
  const ataResult = svm.sendTransaction(createAtaTx);
  if ("err" in ataResult) throw new Error(`Create ATA failed: ${JSON.stringify(ataResult.err)}`);

  // 3. Mint tokens to the ATA
  const mintToTx = new Transaction();
  mintToTx.recentBlockhash = svm.latestBlockhash();
  mintToTx.feePayer = payer.publicKey;
  mintToTx.add(
    createMintToInstruction(
      mintKp.publicKey,
      ata,
      payer.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  mintToTx.sign(payer);
  const mintToResult = svm.sendTransaction(mintToTx);
  if ("err" in mintToResult) throw new Error(`Mint to failed: ${JSON.stringify(mintToResult.err)}`);

  return mintKp;
}

/** Derives the vesting_state PDA */
function deriveVestingState(grantor: PublicKey, beneficiary: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vesting_state"), grantor.toBuffer(), beneficiary.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Builds an Anchor Program client backed by a dummy connection.
 * We only use it to generate instructions (.instruction()), not to send txs.
 */
function buildProgram(payer: Keypair): Program {
  // Dummy connection pointing nowhere — we never actually call it
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  return new Program(idl as Idl, provider);
}

/**
 * Asserts that a LiteSVM transaction failed with a specific Anchor custom error code.
 *
 * LiteSVM uses a class-based API:
 *   - result is FailedTransactionMetadata
 *   - result.err() returns a TransactionErrorInstructionError (or other variant)
 *   - txErr.err() returns InstructionErrorCustom with a `.code` number
 */
function assertCustomError(result: any, expectedCode: number, label: string) {
  // 1. Must have failed
  assert.ok(
    typeof result.err === "function",
    `${label}: expected transaction to fail but it succeeded`
  );

  // 2. Get the transaction-level error object
  const txErr = result.err();

  // 3. It must be an InstructionError (has an inner .err() method)
  assert.ok(
    typeof txErr?.err === "function",
    `${label}: expected an InstructionError, got: ${txErr}`
  );

  // 4. Get the instruction-level error (InstructionErrorCustom has .code)
  const ixErr = txErr.err();
  const actualCode: number | undefined = ixErr?.code;

  assert.strictEqual(
    actualCode,
    expectedCode,
    `${label}: expected error code ${expectedCode}, got ${actualCode}`
  );
}

// ─── Error Codes (from IDL) ───────────────────────────────────────────────────
const ERR = {
  ZeroAmount:           6001,
  ZeroDuration:         6002,
  InvalidCliffTime:     6003,
  CliffExceedsVestingEnd: 6004,
  GrantorIsBeneficiary: 6005,
} as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("capstone_vesting_vault", () => {
  let svm: LiteSVM;
  let grantor: Keypair;
  let beneficiary: Keypair;
  let mintKp: Keypair;
  let grantorAta: PublicKey;
  let vestingStatePda: PublicKey;
  let vestingVault: PublicKey;
  let program: Program;

  // Vesting schedule parameters
  const now = Math.floor(Date.now() / 1000);
  const startTime = new BN(now);
  const cliffTime = new BN(now + 60 * 60 * 24 * 30);   // 30 days after start
  const vestingDuration = new BN(60 * 60 * 24 * 365);   // 1 year
  const totalAmount = new BN(VEST_AMOUNT.toString());

  before(() => {
    // ── 1. Boot LiteSVM with SPL programs ──────────────────────────────────
    svm = new LiteSVM().withDefaultPrograms();

    // ── 2. Load our program ────────────────────────────────────────────────
    svm.addProgramFromFile(PROGRAM_ID, "target/deploy/capstone_vesting_vault.so");

    // ── 3. Create keypairs and fund them ───────────────────────────────────
    grantor = Keypair.generate();
    beneficiary = Keypair.generate();
    svm.airdrop(grantor.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(beneficiary.publicKey, BigInt(LAMPORTS_PER_SOL));

    // ── 4. Create mint and fund grantor's ATA ──────────────────────────────
    mintKp = createMintAndMintTo(svm, grantor, grantor.publicKey, MINT_AMOUNT);
    grantorAta = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      grantor.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    // ── 5. Derive PDAs ─────────────────────────────────────────────────────
    [vestingStatePda] = deriveVestingState(grantor.publicKey, beneficiary.publicKey);
    vestingVault = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      vestingStatePda,
      true, // allowOwnerOffCurve — PDA can own token accounts
      TOKEN_PROGRAM_ID
    );

    // ── 6. Build Anchor program client (for instruction building only) ──────
    program = buildProgram(grantor);
  });

  // ── Happy Path ─────────────────────────────────────────────────────────────
  it("initializes the vesting vault successfully", async () => {
    const ix = await program.methods
      .initialize(startTime, cliffTime, vestingDuration, totalAmount)
      .accounts({
        grantor: grantor.publicKey,
        beneficiary: beneficiary.publicKey,
        tokenMint: mintKp.publicKey,
        grantorAta,
        vestingState: vestingStatePda,
        vestingVault,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = grantor.publicKey;
    tx.add(ix);
    tx.sign(grantor);

    const result = svm.sendTransaction(tx);
    assert.ok(
      !("err" in result),
      `Transaction failed: ${JSON.stringify((result as any).err)}`
    );

    // Verify vesting_state account was created on-chain
    const stateAccount = svm.getAccount(vestingStatePda);
    assert.ok(stateAccount !== null, "vesting_state account should exist after init");

    // Verify vesting_vault was created and received tokens
    const vaultAccount = svm.getAccount(vestingVault);
    assert.ok(vaultAccount !== null, "vesting_vault token account should exist after init");
  });

  // ── Validation: ZeroAmount ─────────────────────────────────────────────────
  it("fails when total_amount is zero", async () => {
    const g = Keypair.generate();
    const b = Keypair.generate();
    svm.airdrop(g.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    const mint = createMintAndMintTo(svm, g, g.publicKey, MINT_AMOUNT);
    const gAta = getAssociatedTokenAddressSync(mint.publicKey, g.publicKey, false, TOKEN_PROGRAM_ID);
    const [state] = deriveVestingState(g.publicKey, b.publicKey);
    const vault = getAssociatedTokenAddressSync(mint.publicKey, state, true, TOKEN_PROGRAM_ID);
    const prog = buildProgram(g);

    const ix = await prog.methods
      .initialize(startTime, cliffTime, vestingDuration, new BN(0)) // ← zero amount
      .accounts({
        grantor: g.publicKey,
        beneficiary: b.publicKey,
        tokenMint: mint.publicKey,
        grantorAta: gAta,
        vestingState: state,
        vestingVault: vault,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = g.publicKey;
    tx.add(ix);
    tx.sign(g);

    const result = svm.sendTransaction(tx);
    assertCustomError(result, ERR.ZeroAmount, "ZeroAmount");
  });

  // ── Validation: InvalidCliffTime ───────────────────────────────────────────
  it("fails when cliff_time is before start_time", async () => {
    const g = Keypair.generate();
    const b = Keypair.generate();
    svm.airdrop(g.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    const mint = createMintAndMintTo(svm, g, g.publicKey, MINT_AMOUNT);
    const gAta = getAssociatedTokenAddressSync(mint.publicKey, g.publicKey, false, TOKEN_PROGRAM_ID);
    const [state] = deriveVestingState(g.publicKey, b.publicKey);
    const vault = getAssociatedTokenAddressSync(mint.publicKey, state, true, TOKEN_PROGRAM_ID);
    const prog = buildProgram(g);

    const invalidCliff = new BN(now - 100); // cliff BEFORE start ← invalid

    const ix = await prog.methods
      .initialize(startTime, invalidCliff, vestingDuration, totalAmount)
      .accounts({
        grantor: g.publicKey,
        beneficiary: b.publicKey,
        tokenMint: mint.publicKey,
        grantorAta: gAta,
        vestingState: state,
        vestingVault: vault,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = g.publicKey;
    tx.add(ix);
    tx.sign(g);

    const result = svm.sendTransaction(tx);
    assertCustomError(result, ERR.InvalidCliffTime, "InvalidCliffTime");
  });

  // ── Validation: GrantorIsBeneficiary ──────────────────────────────────────
  it("fails when grantor and beneficiary are the same", async () => {
    const g = Keypair.generate();
    svm.airdrop(g.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    const mint = createMintAndMintTo(svm, g, g.publicKey, MINT_AMOUNT);
    const gAta = getAssociatedTokenAddressSync(mint.publicKey, g.publicKey, false, TOKEN_PROGRAM_ID);
    // beneficiary = grantor (same key) ← invalid
    const [state] = deriveVestingState(g.publicKey, g.publicKey);
    const vault = getAssociatedTokenAddressSync(mint.publicKey, state, true, TOKEN_PROGRAM_ID);
    const prog = buildProgram(g);

    const ix = await prog.methods
      .initialize(startTime, cliffTime, vestingDuration, totalAmount)
      .accounts({
        grantor: g.publicKey,
        beneficiary: g.publicKey, // ← same as grantor
        tokenMint: mint.publicKey,
        grantorAta: gAta,
        vestingState: state,
        vestingVault: vault,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = g.publicKey;
    tx.add(ix);
    tx.sign(g);

    const result = svm.sendTransaction(tx);
    assertCustomError(result, ERR.GrantorIsBeneficiary, "GrantorIsBeneficiary");
  });
});
