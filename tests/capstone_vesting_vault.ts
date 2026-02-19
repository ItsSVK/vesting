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
  AccountLayout,
} from "@solana/spl-token";
import { LiteSVM, Clock } from "litesvm";
import assert from "assert";
import idl from "../target/idl/capstone_vesting_vault.json";

// ─── Constants ────────────────────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey(idl.address);
const TOKEN_DECIMALS = 6;
const MINT_AMOUNT = new BN(1_000_000_000); // 1000 tokens (with 6 decimals)
const VEST_AMOUNT = new BN(500_000_000);   // 500 tokens to vest

// ─── Time constants (in seconds) ─────────────────────────────────────────────
const ONE_DAY = 60 * 60 * 24;
const THIRTY_DAYS = ONE_DAY * 30;
const NINETY_DAYS = ONE_DAY * 90; // vesting duration (3 × 30-day periods)

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
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  return new Program(idl as Idl, provider);
}

/**
 * Asserts that a LiteSVM transaction failed with a specific Anchor custom error code.
 */
function assertCustomError(result: any, expectedCode: number, label: string) {
  assert.ok(
    typeof result.err === "function",
    `${label}: expected transaction to fail but it succeeded`
  );
  const txErr = result.err();
  assert.ok(
    typeof txErr?.err === "function",
    `${label}: expected an InstructionError, got: ${txErr}`
  );
  const ixErr = txErr.err();
  const actualCode: number | undefined = ixErr?.code;
  assert.strictEqual(
    actualCode,
    expectedCode,
    `${label}: expected error code ${expectedCode}, got ${actualCode}`
  );
}

/** Reads the raw token balance from a token account via LiteSVM */
function getTokenBalance(svm: LiteSVM, ata: PublicKey): bigint {
  const accountInfo = svm.getAccount(ata);
  if (!accountInfo) return new BN(0);
  const decoded = AccountLayout.decode(Buffer.from(accountInfo.data));
  return decoded.amount;
}

/**
 * Fast-forwards the Clock sysvar to a specific unix timestamp.
 *
 * How this works:
 *   The program calls `Clock::get()?.unix_timestamp` to know "now".
 *   LiteSVM exposes `getClock()` / `setClock()` to read/write this sysvar
 *   directly — no real-time waiting required. We read the current clock,
 *   mutate just the `unixTimestamp` field, then write it back.
 */
function setClock(svm: LiteSVM, unixTimestamp: number) {
  const current = svm.getClock();
  // Clock constructor: (slot, epochStartTimestamp, epoch, leaderScheduleEpoch, unixTimestamp)
  const updated = new Clock(
    current.slot,
    current.epochStartTimestamp,
    current.epoch,
    current.leaderScheduleEpoch,
    BigInt(unixTimestamp)
  );
  svm.setClock(updated);
}

// ─── Error Codes (from IDL, offset 6000) ─────────────────────────────────────
const ERR = {
  ZeroAmount:            6001,
  ZeroDuration:          6002,
  InvalidCliffTime:      6003,
  CliffExceedsVestingEnd: 6004,
  GrantorIsBeneficiary:  6005,
  InsufficientBalance:   6006,
  InvalidStartTime:      6007,
  CliffNotPassed:        6008,
  VestingInactive:       6009,
} as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("capstone_vesting_vault – initialize", () => {
  let svm: LiteSVM;
  let grantor: Keypair;
  let beneficiary: Keypair;
  let mintKp: Keypair;
  let grantorAta: PublicKey;
  let vestingStatePda: PublicKey;
  let vestingVault: PublicKey;
  let program: Program;

  const now = Math.floor(Date.now() / 1000);
  const startTime = new BN(now);
  const cliffTime = new BN(now + THIRTY_DAYS);
  const frequency = new BN(THIRTY_DAYS);
  const vestingDuration = new BN(60 * 60 * 24 * 365); // 1 year
  const totalAmount = new BN(VEST_AMOUNT.toString());

  before(() => {
    svm = new LiteSVM().withDefaultPrograms();
    svm.addProgramFromFile(PROGRAM_ID, "target/deploy/capstone_vesting_vault.so");

    grantor = Keypair.generate();
    beneficiary = Keypair.generate();
    svm.airdrop(grantor.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(beneficiary.publicKey, BigInt(LAMPORTS_PER_SOL));

    mintKp = createMintAndMintTo(svm, grantor, grantor.publicKey, MINT_AMOUNT);
    grantorAta = getAssociatedTokenAddressSync(mintKp.publicKey, grantor.publicKey, false, TOKEN_PROGRAM_ID);

    [vestingStatePda] = deriveVestingState(grantor.publicKey, beneficiary.publicKey);
    vestingVault = getAssociatedTokenAddressSync(mintKp.publicKey, vestingStatePda, true, TOKEN_PROGRAM_ID);

    program = buildProgram(grantor);
  });

  it("initializes the vesting vault successfully", async () => {
    const ix = await program.methods
      .initialize(startTime, cliffTime, vestingDuration, totalAmount, frequency)
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
    assert.ok(!("err" in result), `Init failed: ${JSON.stringify((result as any).err)}`);
    assert.ok(svm.getAccount(vestingStatePda) !== null, "vesting_state should exist");
    assert.ok(svm.getAccount(vestingVault) !== null, "vesting_vault should exist");
  });

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
      .initialize(startTime, cliffTime, vestingDuration, new BN(0), frequency)
      .accounts({ grantor: g.publicKey, beneficiary: b.publicKey, tokenMint: mint.publicKey, grantorAta: gAta, vestingState: state, vestingVault: vault, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .instruction();

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = g.publicKey;
    tx.add(ix);
    tx.sign(g);
    assertCustomError(svm.sendTransaction(tx), ERR.ZeroAmount, "ZeroAmount");
  });

  it("fails when cliff_time is before start_time", async () => {
    const g = Keypair.generate();
    const b = Keypair.generate();
    svm.airdrop(g.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    const mint = createMintAndMintTo(svm, g, g.publicKey, MINT_AMOUNT);
    const gAta = getAssociatedTokenAddressSync(mint.publicKey, g.publicKey, false, TOKEN_PROGRAM_ID);
    const [state] = deriveVestingState(g.publicKey, b.publicKey);
    const vault = getAssociatedTokenAddressSync(mint.publicKey, state, true, TOKEN_PROGRAM_ID);
    const prog = buildProgram(g);

    const ix = await prog.methods
      .initialize(startTime, new BN(now - 100), vestingDuration, totalAmount, frequency)
      .accounts({ grantor: g.publicKey, beneficiary: b.publicKey, tokenMint: mint.publicKey, grantorAta: gAta, vestingState: state, vestingVault: vault, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .instruction();

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = g.publicKey;
    tx.add(ix);
    tx.sign(g);
    assertCustomError(svm.sendTransaction(tx), ERR.InvalidCliffTime, "InvalidCliffTime");
  });

  it("fails when grantor and beneficiary are the same", async () => {
    const g = Keypair.generate();
    svm.airdrop(g.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    const mint = createMintAndMintTo(svm, g, g.publicKey, MINT_AMOUNT);
    const gAta = getAssociatedTokenAddressSync(mint.publicKey, g.publicKey, false, TOKEN_PROGRAM_ID);
    const [state] = deriveVestingState(g.publicKey, g.publicKey);
    const vault = getAssociatedTokenAddressSync(mint.publicKey, state, true, TOKEN_PROGRAM_ID);
    const prog = buildProgram(g);

    const ix = await prog.methods
      .initialize(startTime, cliffTime, vestingDuration, totalAmount, frequency)
      .accounts({ grantor: g.publicKey, beneficiary: g.publicKey, tokenMint: mint.publicKey, grantorAta: gAta, vestingState: state, vestingVault: vault, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .instruction();

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = g.publicKey;
    tx.add(ix);
    tx.sign(g);
    assertCustomError(svm.sendTransaction(tx), ERR.GrantorIsBeneficiary, "GrantorIsBeneficiary");
  });
});

// =============================================================================
// WITHDRAW TESTS
// =============================================================================
//
// KEY CONCEPT — Time manipulation with LiteSVM:
//   The withdraw handler reads `Clock::get()?.unix_timestamp` to get "now".
//   LiteSVM lets us override the Clock sysvar instantly via `setClock()`.
//   Our helper reads the current clock, replaces `unixTimestamp`, and writes
//   it back — so "simulate 30 days later" is just one function call.
//   This makes time-dependent tests instant (no real waiting needed).
//
// VESTING MATH (from withdraw.rs):
//   tokens_per_period  = total_amount * frequency / vesting_duration
//   completed_periods  = (now - cliff_time) / frequency   [integer division]
//   vested_till_now    = min(completed_periods * tokens_per_period, total_amount)
//   available          = vested_till_now - total_withdrawn
// =============================================================================

describe("capstone_vesting_vault – withdraw", () => {
  let svm: LiteSVM;
  let grantor: Keypair;
  let beneficiary: Keypair;
  let mintKp: Keypair;
  let grantorAta: PublicKey;
  let vestingStatePda: PublicKey;
  let vestingVault: PublicKey;
  let beneficiaryAta: PublicKey;
  let program: Program;
  let beneficiaryProgram: Program;

  // Fixed base time — makes all offset arithmetic deterministic and readable
  const BASE_TIME = 1_000_000;

  // Schedule: cliff = BASE + 30d, vesting for 90d in 3 × 30d periods
  const startTime    = new BN(BASE_TIME);
  const cliffTime    = new BN(BASE_TIME + THIRTY_DAYS);
  const vestDuration = new BN(NINETY_DAYS);
  const frequency    = new BN(THIRTY_DAYS);
  // 900_000_000 divides cleanly into 3 periods of 300_000_000 each
  const totalAmount     = new BN(900_000_000);
  const TOKENS_PER_PERIOD = 300_000_000;

  /** Helper: sends a withdraw instruction signed by the beneficiary */
  async function callWithdraw(amount: number): Promise<any> {
    const ix = await beneficiaryProgram.methods
      .withdraw(new BN(amount))
      .accounts({
        beneficiary: beneficiary.publicKey,
        grantor: grantor.publicKey,
        vestingState: vestingStatePda,
        vestingVault,
        tokenMint: mintKp.publicKey,
        beneficiaryAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    // Expire blockhash before each call so LiteSVM doesn't treat repeated
    // transactions (same accounts, different clock) as duplicates.
    svm.expireBlockhash();
    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = beneficiary.publicKey;
    tx.add(ix);
    tx.sign(beneficiary);
    return svm.sendTransaction(tx);
  }

  before(async () => {
    svm = new LiteSVM().withDefaultPrograms();
    svm.addProgramFromFile(PROGRAM_ID, "target/deploy/capstone_vesting_vault.so");

    // Pin the clock to BASE_TIME so all timestamps are predictable
    setClock(svm, BASE_TIME);

    grantor     = Keypair.generate();
    beneficiary = Keypair.generate();
    svm.airdrop(grantor.publicKey,     BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(beneficiary.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    mintKp = createMintAndMintTo(svm, grantor, grantor.publicKey, BigInt(totalAmount.toNumber() * 2));
    grantorAta = getAssociatedTokenAddressSync(mintKp.publicKey, grantor.publicKey, false, TOKEN_PROGRAM_ID);

    [vestingStatePda] = deriveVestingState(grantor.publicKey, beneficiary.publicKey);
    vestingVault = getAssociatedTokenAddressSync(mintKp.publicKey, vestingStatePda, true, TOKEN_PROGRAM_ID);
    // init_if_needed creates this on first withdraw; derive address now for balance checks
    beneficiaryAta = getAssociatedTokenAddressSync(mintKp.publicKey, beneficiary.publicKey, false, TOKEN_PROGRAM_ID);

    program            = buildProgram(grantor);
    beneficiaryProgram = buildProgram(beneficiary);

    // Initialize the vesting vault at BASE_TIME
    const initIx = await program.methods
      .initialize(startTime, cliffTime, vestDuration, totalAmount, frequency)
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

    const initTx = new Transaction();
    initTx.recentBlockhash = svm.latestBlockhash();
    initTx.feePayer = grantor.publicKey;
    initTx.add(initIx);
    initTx.sign(grantor);
    const initResult = svm.sendTransaction(initTx);
    assert.ok(!("err" in initResult), `Initialize failed: ${JSON.stringify(initResult)}`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ERROR CASES
  // ──────────────────────────────────────────────────────────────────────────

  it("❌ fails with CliffNotPassed when called 1 second before cliff", async () => {
    // Cliff is at BASE_TIME + THIRTY_DAYS; set clock to 1 second before
    setClock(svm, BASE_TIME + THIRTY_DAYS - 1);
    const result = await callWithdraw(1);
    assertCustomError(result, ERR.CliffNotPassed, "CliffNotPassed");
  });

  it("❌ fails with InsufficientBalance at exact cliff (0 periods elapsed)", async () => {
    // At cliff_time exactly: time_elapsed = 0 → 0 complete periods → 0 vested
    setClock(svm, BASE_TIME + THIRTY_DAYS);
    const result = await callWithdraw(1);
    assertCustomError(result, ERR.InsufficientBalance, "0 periods at cliff");
  });

  it("❌ fails with InsufficientBalance when requesting more than vested (1 period in)", async () => {
    // After 1 period: 300M is vested. Requesting 300M+1 should fail.
    setClock(svm, BASE_TIME + THIRTY_DAYS + THIRTY_DAYS);
    const result = await callWithdraw(TOKENS_PER_PERIOD + 1);
    assertCustomError(result, ERR.InsufficientBalance, "over-withdraw after 1 period");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // HAPPY PATHS
  // The tests below run sequentially — each one advances time and withdraws,
  // building cumulative state. The order matters.
  // ──────────────────────────────────────────────────────────────────────────

  it("✅ withdraws 1 period's worth of tokens after period 1 elapses", async () => {
    // clock: cliff + 1 period → 1 completed period → 300M vested
    setClock(svm, BASE_TIME + THIRTY_DAYS + THIRTY_DAYS);

    const result = await callWithdraw(TOKENS_PER_PERIOD);
    assert.ok(!("err" in result), `Withdraw period 1 failed: ${JSON.stringify(result)}`);

    const balance = getTokenBalance(svm, beneficiaryAta);
    assert.strictEqual(balance, BigInt(TOKENS_PER_PERIOD), "beneficiary balance after period 1");
  });

  it("❌ fails with InsufficientBalance right after draining period 1", async () => {
    // Same clock as above — already withdrew all available 300M, so available = 0
    setClock(svm, BASE_TIME + THIRTY_DAYS + THIRTY_DAYS);
    const result = await callWithdraw(1);
    assertCustomError(result, ERR.InsufficientBalance, "nothing left after period 1 drained");
  });

  it("✅ partial withdraw: withdraws half of the newly vested tokens at period 2", async () => {
    // clock: cliff + 2 periods → 2 periods vested = 600M total, 300M already withdrawn → 300M available
    setClock(svm, BASE_TIME + THIRTY_DAYS + 2 * THIRTY_DAYS);

    const partialAmount = TOKENS_PER_PERIOD / 2; // 150M
    const result = await callWithdraw(partialAmount);
    assert.ok(!("err" in result), `Partial withdraw failed: ${JSON.stringify(result)}`);

    const balance = getTokenBalance(svm, beneficiaryAta);
    // Previously had 300M, now has 300M + 150M = 450M
    assert.strictEqual(balance, BigInt(TOKENS_PER_PERIOD + partialAmount));
  });

  it("✅ withdraws the remaining tokens left from period 2", async () => {
    // Still at period 2 clock. 150M was already withdrawn this period, 150M remains.
    setClock(svm, BASE_TIME + THIRTY_DAYS + 2 * THIRTY_DAYS);

    const remaining = TOKENS_PER_PERIOD / 2; // 150M remaining from period 2
    const result = await callWithdraw(remaining);
    assert.ok(!("err" in result), `Second partial withdraw failed: ${JSON.stringify(result)}`);

    // Total: 300M (p1) + 150M + 150M (p2) = 600M = 2 full periods
    const balance = getTokenBalance(svm, beneficiaryAta);
    assert.strictEqual(balance, BigInt(2 * TOKENS_PER_PERIOD));
  });

  it("❌ fails after fully draining period 2 — period 3 hasn't elapsed yet", async () => {
    setClock(svm, BASE_TIME + THIRTY_DAYS + 2 * THIRTY_DAYS);
    const result = await callWithdraw(1);
    assertCustomError(result, ERR.InsufficientBalance, "period 2 fully drained");
  });

  it("✅ withdraws the final period's tokens after vesting schedule ends", async () => {
    // Past the full 90-day vesting: all 900M vested, 600M withdrawn → 300M left
    setClock(svm, BASE_TIME + THIRTY_DAYS + NINETY_DAYS + 1);

    const finalAmount = TOKENS_PER_PERIOD; // last 300M
    const result = await callWithdraw(finalAmount);
    assert.ok(!("err" in result), `Final withdraw failed: ${JSON.stringify(result)}`);

    // Beneficiary should now hold the entire totalAmount
    const balance = getTokenBalance(svm, beneficiaryAta);
    assert.strictEqual(balance, BigInt(totalAmount.toNumber()), "all tokens received");

    // Vault should be completely empty
    const vaultBalance = getTokenBalance(svm, vestingVault);
    assert.strictEqual(vaultBalance, BigInt(0), "vault drained");
  });

  it("❌ fails with InsufficientBalance when trying to over-withdraw after full vest", async () => {
    // All 900M is already withdrawn — nothing left, even though vesting is complete
    setClock(svm, BASE_TIME + THIRTY_DAYS + NINETY_DAYS + 1);
    const result = await callWithdraw(1);
    assertCustomError(result, ERR.InsufficientBalance, "nothing left after full withdrawal");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // INACTIVE VESTING — uses a fresh isolated vault
  // ──────────────────────────────────────────────────────────────────────────

  it("❌ fails with VestingInactive when is_active is flipped to false", async () => {
    // Spin up fresh actors so we don't pollute the shared vault state
    const g2 = Keypair.generate();
    const b2 = Keypair.generate();
    svm.airdrop(g2.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(b2.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    const mint2   = createMintAndMintTo(svm, g2, g2.publicKey, BigInt(totalAmount.toNumber() * 2));
    const g2Ata   = getAssociatedTokenAddressSync(mint2.publicKey, g2.publicKey, false, TOKEN_PROGRAM_ID);
    const [state2] = deriveVestingState(g2.publicKey, b2.publicKey);
    const vault2  = getAssociatedTokenAddressSync(mint2.publicKey, state2, true, TOKEN_PROGRAM_ID);
    const b2Ata   = getAssociatedTokenAddressSync(mint2.publicKey, b2.publicKey, false, TOKEN_PROGRAM_ID);
    const b2Prog  = buildProgram(b2);

    // Initialize a fresh vault for g2/b2
    setClock(svm, BASE_TIME);
    const ix2 = await buildProgram(g2).methods
      .initialize(startTime, cliffTime, vestDuration, totalAmount, frequency)
      .accounts({
        grantor: g2.publicKey, beneficiary: b2.publicKey, tokenMint: mint2.publicKey,
        grantorAta: g2Ata, vestingState: state2, vestingVault: vault2,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const initTx2 = new Transaction();
    initTx2.recentBlockhash = svm.latestBlockhash();
    initTx2.feePayer = g2.publicKey;
    initTx2.add(ix2);
    initTx2.sign(g2);
    const initRes2 = svm.sendTransaction(initTx2);
    assert.ok(!("err" in initRes2), "Fresh vault init failed");

    // ── Manually flip is_active = false in account data ──────────────────
    // VestingState byte layout (after 8-byte Anchor discriminator):
    //   grantor[32], beneficiary[32], start_time[8], cliff_time[8],
    //   vesting_duration[8], total_amount[8], total_withdrawn[8],
    //   token_mint[32], is_active[1]
    //   Offset = 8 + 32+32+8+8+8+8+8+32 = 8 + 136 = 144
    const stateAcct2 = svm.getAccount(state2)!;
    const data2 = Buffer.from(stateAcct2.data);
    const IS_ACTIVE_OFFSET = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 32; // = 144
    data2[IS_ACTIVE_OFFSET] = 0; // false
    svm.setAccount(state2, { ...stateAcct2, data: data2 });

    // Advance past cliff, then try to withdraw — should be blocked
    setClock(svm, BASE_TIME + THIRTY_DAYS + THIRTY_DAYS);

    const wIx = await b2Prog.methods
      .withdraw(new BN(1))
      .accounts({
        beneficiary: b2.publicKey, grantor: g2.publicKey, vestingState: state2,
        vestingVault: vault2, tokenMint: mint2.publicKey, beneficiaryAta: b2Ata,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const wTx = new Transaction();
    wTx.recentBlockhash = svm.latestBlockhash();
    wTx.feePayer = b2.publicKey;
    wTx.add(wIx);
    wTx.sign(b2);

    assertCustomError(svm.sendTransaction(wTx), ERR.VestingInactive, "VestingInactive");
  });
});
