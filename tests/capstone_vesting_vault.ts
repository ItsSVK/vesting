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
const VEST_AMOUNT = new BN(500).mul(new BN(10 ** TOKEN_DECIMALS));           // 500 tokens (raw, contract no longer scales)

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
function deriveVestingState(
  grantor: PublicKey,
  beneficiary: PublicKey,
  tokenMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("vesting_state"),
      grantor.toBuffer(),
      beneficiary.toBuffer(),
      tokenMint.toBuffer(),
    ],
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
 * Asserts that a LiteSVM transaction succeeded.
 */
function assertSuccess(result: any, label: string) {
  if (typeof result?.err === "function") {
    const txErr = result.err();
    console.log("ASSERT SUCCESS FAILED:", JSON.stringify(txErr));
    assert.fail(`${label}: expected success but transaction failed: ${JSON.stringify(txErr)}`);
  }
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
  NotZero:               6000,
  ZeroAmount:            6001,
  ZeroDuration:          6002,
  InvalidCliffTime:      6003,
  CliffExceedsVestingEnd: 6004,
  GrantorIsBeneficiary:  6005,
  InsufficientBalance:   6006,
  InvalidStartTime:      6007,
  CliffNotPassed:        6008,
  VestingInactive:       6009,
  ZeroFrequency:         6010,
  ZeroCliffTime:         6011,
  FrequencyExceedsVestingDuration: 6012,
} as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

// =============================================================================
// INITIALIZE TESTS
// =============================================================================
//
// KEY CHANGES in the updated contract:
//   - initialize(cliff_duration, vesting_duration, total_amount, frequency, unit)
//   - start_time is auto-set from Clock::get() — no longer passed as argument
//   - total_amount is passed in raw tokens; contract scales by 10^decimals
//   - TimeUnit enum: { sec, min, hour, day, week, month, year }
//   - cliff_duration and vesting_duration are multiplied by the unit's
//     multiplier on-chain (e.g. Day → ×86400)
// =============================================================================

describe("capstone_vesting_vault – initialize", () => {
  let svm: LiteSVM;
  let grantor: Keypair;
  let beneficiary: Keypair;
  let mintKp: Keypair;
  let grantorAta: PublicKey;
  let vestingStatePda: PublicKey;
  let vestingVault: PublicKey;
  let program: Program;

  // Using Sec unit so durations are in raw seconds — simplest for testing
  const UNIT = { sec: {} };

  const cliffDuration     = new BN(THIRTY_DAYS);         // 30 days in seconds
  const vestingDuration   = new BN(60 * 60 * 24 * 365);  // 1 year in seconds
  const frequency         = new BN(THIRTY_DAYS);          // 30 days in seconds
  const totalAmount       = new BN(VEST_AMOUNT.toString()); // 500 tokens (raw)

  before(() => {
    svm = new LiteSVM().withDefaultPrograms();
    svm.addProgramFromFile(PROGRAM_ID, "target/deploy/capstone_vesting_vault.so");

    grantor = Keypair.generate();
    beneficiary = Keypair.generate();
    svm.airdrop(grantor.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(beneficiary.publicKey, BigInt(LAMPORTS_PER_SOL));

    mintKp = createMintAndMintTo(svm, grantor, grantor.publicKey, MINT_AMOUNT);
    grantorAta = getAssociatedTokenAddressSync(mintKp.publicKey, grantor.publicKey, false, TOKEN_PROGRAM_ID);

    [vestingStatePda] = deriveVestingState(grantor.publicKey, beneficiary.publicKey, mintKp.publicKey);
    vestingVault = getAssociatedTokenAddressSync(mintKp.publicKey, vestingStatePda, true, TOKEN_PROGRAM_ID);

    program = buildProgram(grantor);
  });

  it("initializes the vesting vault successfully", async () => {
    const ix = await program.methods
      .initialize(cliffDuration, vestingDuration, totalAmount, frequency, UNIT)
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
    assertSuccess(result, "initialize success");
    assert.ok(svm.getAccount(vestingStatePda) !== null, "vesting_state should exist");
    assert.ok(svm.getAccount(vestingVault) !== null, "vesting_vault should exist");
  });

  it("fails when total_amount is zero", async () => {
    const g = Keypair.generate();
    const b = Keypair.generate();
    svm.airdrop(g.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    const mint = createMintAndMintTo(svm, g, g.publicKey, MINT_AMOUNT);
    const gAta = getAssociatedTokenAddressSync(mint.publicKey, g.publicKey, false, TOKEN_PROGRAM_ID);
    const [state] = deriveVestingState(g.publicKey, b.publicKey, mint.publicKey);
    const vault = getAssociatedTokenAddressSync(mint.publicKey, state, true, TOKEN_PROGRAM_ID);
    const prog = buildProgram(g);

    const ix = await prog.methods
      .initialize(cliffDuration, vestingDuration, new BN(0), frequency, UNIT)
      .accounts({ grantor: g.publicKey, beneficiary: b.publicKey, tokenMint: mint.publicKey, grantorAta: gAta, vestingState: state, vestingVault: vault, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .instruction();

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = g.publicKey;
    tx.add(ix);
    tx.sign(g);
    assertCustomError(svm.sendTransaction(tx), ERR.ZeroAmount, "ZeroAmount");
  });

  it("fails when cliff_duration is zero", async () => {
    const g = Keypair.generate();
    const b = Keypair.generate();
    svm.airdrop(g.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    const mint = createMintAndMintTo(svm, g, g.publicKey, MINT_AMOUNT);
    const gAta = getAssociatedTokenAddressSync(mint.publicKey, g.publicKey, false, TOKEN_PROGRAM_ID);
    const [state] = deriveVestingState(g.publicKey, b.publicKey, mint.publicKey);
    const vault = getAssociatedTokenAddressSync(mint.publicKey, state, true, TOKEN_PROGRAM_ID);
    const prog = buildProgram(g);

    const ix = await prog.methods
      .initialize(new BN(0), vestingDuration, totalAmount, frequency, UNIT)
      .accounts({ grantor: g.publicKey, beneficiary: b.publicKey, tokenMint: mint.publicKey, grantorAta: gAta, vestingState: state, vestingVault: vault, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .instruction();

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = g.publicKey;
    tx.add(ix);
    tx.sign(g);
    assertCustomError(svm.sendTransaction(tx), ERR.ZeroCliffTime, "ZeroCliffTime");
  });

  it("fails when cliff_duration exceeds vesting_duration", async () => {
    const g = Keypair.generate();
    const b = Keypair.generate();
    svm.airdrop(g.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    const mint = createMintAndMintTo(svm, g, g.publicKey, MINT_AMOUNT);
    const gAta = getAssociatedTokenAddressSync(mint.publicKey, g.publicKey, false, TOKEN_PROGRAM_ID);
    const [state] = deriveVestingState(g.publicKey, b.publicKey, mint.publicKey);
    const vault = getAssociatedTokenAddressSync(mint.publicKey, state, true, TOKEN_PROGRAM_ID);
    const prog = buildProgram(g);

    // cliff_duration (100 days) > vesting_duration (90 days) → should fail
    const ix = await prog.methods
      .initialize(new BN(ONE_DAY * 100), new BN(NINETY_DAYS), totalAmount, frequency, UNIT)
      .accounts({ grantor: g.publicKey, beneficiary: b.publicKey, tokenMint: mint.publicKey, grantorAta: gAta, vestingState: state, vestingVault: vault, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .instruction();

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = g.publicKey;
    tx.add(ix);
    tx.sign(g);
    assertCustomError(svm.sendTransaction(tx), ERR.CliffExceedsVestingEnd, "CliffExceedsVestingEnd");
  });

  it("fails when frequency exceeds vesting_duration", async () => {
    const g = Keypair.generate();
    const b = Keypair.generate();
    svm.airdrop(g.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    const mint = createMintAndMintTo(svm, g, g.publicKey, MINT_AMOUNT);
    const gAta = getAssociatedTokenAddressSync(mint.publicKey, g.publicKey, false, TOKEN_PROGRAM_ID);
    const [state] = deriveVestingState(g.publicKey, b.publicKey, mint.publicKey);
    const vault = getAssociatedTokenAddressSync(mint.publicKey, state, true, TOKEN_PROGRAM_ID);
    const prog = buildProgram(g);

    // frequency (120 days) > vesting_duration (90 days) → should fail
    const ix = await prog.methods
      .initialize(cliffDuration, new BN(NINETY_DAYS), totalAmount, new BN(ONE_DAY * 120), UNIT)
      .accounts({ grantor: g.publicKey, beneficiary: b.publicKey, tokenMint: mint.publicKey, grantorAta: gAta, vestingState: state, vestingVault: vault, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .instruction();

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = g.publicKey;
    tx.add(ix);
    tx.sign(g);
    assertCustomError(svm.sendTransaction(tx), ERR.FrequencyExceedsVestingDuration, "FrequencyExceedsVestingDuration");
  });

  it("fails when grantor and beneficiary are the same", async () => {
    const g = Keypair.generate();
    svm.airdrop(g.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    const mint = createMintAndMintTo(svm, g, g.publicKey, MINT_AMOUNT);
    const gAta = getAssociatedTokenAddressSync(mint.publicKey, g.publicKey, false, TOKEN_PROGRAM_ID);
    const [state] = deriveVestingState(g.publicKey, g.publicKey, mint.publicKey);
    const vault = getAssociatedTokenAddressSync(mint.publicKey, state, true, TOKEN_PROGRAM_ID);
    const prog = buildProgram(g);

    const ix = await prog.methods
      .initialize(cliffDuration, vestingDuration, totalAmount, frequency, UNIT)
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
// UPDATED VESTING MATH (from withdraw.rs + state.rs):
//   The contract now computes start_time from Clock::get() at init time.
//   cliff_time    = start_time + cliff_duration * multiplier
//   vesting_end   = start_time + vesting_duration * multiplier
//   frequency     = frequency * multiplier
//
//   In the VestingState::vested_amount():
//   time_elapsed      = now - cliff_time
//   completed_periods = time_elapsed / frequency
//   total_duration    = vesting_end - start_time
//   total_periods     = total_duration / frequency
//   tokens_per_period = total_amount / total_periods
//   vested            = min(completed_periods * tokens_per_period, total_amount)
//   available         = vested - total_withdrawn
//
// NOTE: Using TimeUnit::Sec so multiplier = 1 and durations are raw seconds.
//       The contract auto-scales total_amount and withdraw amount by 10^decimals.
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

  // Using Sec unit so durations are raw seconds
  const UNIT = { sec: {} };

  // Schedule: cliff = 30d, vesting for 90d in 3 × 30d periods
  const cliffDuration  = new BN(THIRTY_DAYS);
  const vestDuration   = new BN(NINETY_DAYS);
  const frequency      = new BN(THIRTY_DAYS);
  // 900 divides cleanly into 3 periods of 300 each
  // Contract stores total_amount = 900 * 10^6 internally
  const DECIMAL_MULTIPLIER = 10 ** TOKEN_DECIMALS;
  const totalAmount     = new BN(900 * DECIMAL_MULTIPLIER);
  const TOKENS_PER_PERIOD = 300;

  /** Helper: sends a withdraw instruction signed by the beneficiary.
   *  `amount` is in raw tokens — contract auto-scales by 10^decimals. */
  async function callWithdraw(amount: number): Promise<any> {
    const ix = await beneficiaryProgram.methods
      .withdraw(new BN(amount * DECIMAL_MULTIPLIER))
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

    // Pin the clock to BASE_TIME so start_time = BASE_TIME when initialize runs
    setClock(svm, BASE_TIME);

    grantor     = Keypair.generate();
    beneficiary = Keypair.generate();
    svm.airdrop(grantor.publicKey,     BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(beneficiary.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    // Mint enough raw tokens: 900 * 10^6 * 2 (extra headroom)
    mintKp = createMintAndMintTo(svm, grantor, grantor.publicKey, BigInt(totalAmount.toNumber() * DECIMAL_MULTIPLIER * 2));
    grantorAta = getAssociatedTokenAddressSync(mintKp.publicKey, grantor.publicKey, false, TOKEN_PROGRAM_ID);

    [vestingStatePda] = deriveVestingState(grantor.publicKey, beneficiary.publicKey, mintKp.publicKey);
    vestingVault = getAssociatedTokenAddressSync(mintKp.publicKey, vestingStatePda, true, TOKEN_PROGRAM_ID);
    // init_if_needed creates this on first withdraw; derive address now for balance checks
    beneficiaryAta = getAssociatedTokenAddressSync(mintKp.publicKey, beneficiary.publicKey, false, TOKEN_PROGRAM_ID);

    program            = buildProgram(grantor);
    beneficiaryProgram = buildProgram(beneficiary);

    // Initialize the vesting vault at BASE_TIME
    // Contract will set: start_time = BASE_TIME (from Clock)
    //   cliff_time    = BASE_TIME + THIRTY_DAYS (cliff_duration * 1 for Sec unit)
    //   vesting_end   = BASE_TIME + NINETY_DAYS
    //   total_amount  = 900 * 10^6 (scaled internally)
    const initIx = await program.methods
      .initialize(cliffDuration, vestDuration, totalAmount, frequency, UNIT)
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
    assertSuccess(initResult, "withdraw suite initialize");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ERROR CASES
  // ──────────────────────────────────────────────────────────────────────────

  it("❌ fails with CliffNotPassed when called 1 second before cliff", async () => {
    // cliff_time = BASE_TIME + THIRTY_DAYS. Set clock to 1 second before.
    setClock(svm, BASE_TIME + THIRTY_DAYS - 1);
    const result = await callWithdraw(1);
    assertCustomError(result, ERR.CliffNotPassed, "CliffNotPassed");
  });

  it("✅ withdraws the 1st period's worth of tokens exactly at the cliff drop", async () => {
    // At cliff_time exactly: time_elapsed = 30 days → 1 complete period → 300 vested
    setClock(svm, BASE_TIME + THIRTY_DAYS);
    const result = await callWithdraw(TOKENS_PER_PERIOD);
    assertSuccess(result, "withdraw at cliff");
    const balance = getTokenBalance(svm, beneficiaryAta);
    assert.strictEqual(balance, BigInt(TOKENS_PER_PERIOD * DECIMAL_MULTIPLIER));
  });

  it("❌ fails with InsufficientBalance when requesting more right after the cliff drop", async () => {
    setClock(svm, BASE_TIME + THIRTY_DAYS);
    const result = await callWithdraw(1);
    assertCustomError(result, ERR.InsufficientBalance, "over-withdraw at cliff");
  });

  it("✅ withdraws the 2nd period's tokens after period 2 elapses", async () => {
    // clock: 60 days from start → 2 completed periods → 600 total vested, 300 withdrawn = 300 available
    setClock(svm, BASE_TIME + 2 * THIRTY_DAYS);
    const result = await callWithdraw(TOKENS_PER_PERIOD);
    assertSuccess(result, "withdraw period 2");
    const balance = getTokenBalance(svm, beneficiaryAta);
    assert.strictEqual(balance, BigInt(2 * TOKENS_PER_PERIOD * DECIMAL_MULTIPLIER));
  });

  it("❌ fails right after draining period 2", async () => {
    setClock(svm, BASE_TIME + 2 * THIRTY_DAYS);
    const result = await callWithdraw(1);
    assertCustomError(result, ERR.InsufficientBalance, "nothing left after period 2 drained");
  });

  it("✅ partial withdraw: withdraws half of the newly vested tokens at period 3 (vesting end)", async () => {
    // clock: base + 90 days → 3 periods vested = 900 total, 600 already withdrawn → 300 available
    setClock(svm, BASE_TIME + 3 * THIRTY_DAYS);
    const partialAmount = TOKENS_PER_PERIOD / 2; // 150
    const result = await callWithdraw(partialAmount);
    assertSuccess(result, "partial withdraw period 3");
    const balance = getTokenBalance(svm, beneficiaryAta);
    assert.strictEqual(balance, BigInt((2 * TOKENS_PER_PERIOD + partialAmount) * DECIMAL_MULTIPLIER));
  });

  it("✅ withdraws the remaining tokens left from period 3, emptying the vault", async () => {
    // Still at base + 90 days. 150 was already withdrawn this period, 150 remains.
    setClock(svm, BASE_TIME + 3 * THIRTY_DAYS);
    const remaining = TOKENS_PER_PERIOD / 2; // 150 remaining from period 3
    const result = await callWithdraw(remaining);
    assertSuccess(result, "second partial withdraw period 3");
    const balance = getTokenBalance(svm, beneficiaryAta);
    assert.strictEqual(balance, BigInt(3 * TOKENS_PER_PERIOD * DECIMAL_MULTIPLIER));
    
    // Vault should be completely empty
    const vaultBalance = getTokenBalance(svm, vestingVault);
    assert.strictEqual(vaultBalance, BigInt(0), "vault drained");
  });

  it("❌ fails with InsufficientBalance when trying to over-withdraw after full vest", async () => {
    // All 900 is already withdrawn — nothing left
    setClock(svm, BASE_TIME + 3 * THIRTY_DAYS + 1);
    const result = await callWithdraw(1);
    assertCustomError(result, ERR.InsufficientBalance, "nothing left after full withdrawal");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // INACTIVE VESTING — uses a fresh isolated vault
  // ──────────────────────────────────────────────────────────────────────────


});

// ──────────────────────────────────────────────────────────────────────────
// REVOKE & CLOSE TESTS
// ──────────────────────────────────────────────────────────────────────────

describe("capstone_vesting_vault – revoke", () => {
  let svm: LiteSVM;
  let grantor: Keypair;
  let beneficiary: Keypair;
  let mintKp: Keypair;
  let grantorAta: PublicKey;
  let vestingStatePda: PublicKey;
  let vestingVault: PublicKey;
  let beneficiaryAta: PublicKey;
  let program: Program;

  const BASE_TIME = 1_000_000;
  const UNIT = { sec: {} };

  // Standard setup: 30d cliff, 90d duration (3 periods), 900 tokens total
  const cliffDuration = new BN(THIRTY_DAYS);
  const vestDuration  = new BN(NINETY_DAYS);
  const frequency     = new BN(THIRTY_DAYS);
  const DECIMAL_MULTIPLIER = 10 ** TOKEN_DECIMALS;
  const totalAmount   = new BN(900 * DECIMAL_MULTIPLIER);
  const TOKENS_PER_PERIOD = 300;

  before(async () => {
    svm = new LiteSVM().withDefaultPrograms();
    svm.addProgramFromFile(PROGRAM_ID, "target/deploy/capstone_vesting_vault.so");
    setClock(svm, BASE_TIME);

    grantor = Keypair.generate();
    beneficiary = Keypair.generate();
    svm.airdrop(grantor.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(beneficiary.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    mintKp = createMintAndMintTo(svm, grantor, grantor.publicKey, BigInt(2000_000_000));
    grantorAta = getAssociatedTokenAddressSync(mintKp.publicKey, grantor.publicKey, false, TOKEN_PROGRAM_ID);
    [vestingStatePda] = deriveVestingState(grantor.publicKey, beneficiary.publicKey, mintKp.publicKey);
    vestingVault = getAssociatedTokenAddressSync(mintKp.publicKey, vestingStatePda, true, TOKEN_PROGRAM_ID);
    beneficiaryAta = getAssociatedTokenAddressSync(mintKp.publicKey, beneficiary.publicKey, false, TOKEN_PROGRAM_ID);
    program = buildProgram(grantor);

    // Initialize vault
    const ix = await program.methods
      .initialize(cliffDuration, vestDuration, totalAmount, frequency, UNIT)
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
    const initResult = svm.sendTransaction(tx);
    assertSuccess(initResult, "revoke suite initialize");
  });

  it("✅ revokes halfway through vesting (1 period elapsed)", async () => {
    // 1. Advance time to 1 period elapsed from the start (cliff + 1s)
    // Cliff is 30 days. We advance to 30 days + 1 second.
    // At this point, 1 period (30 days) is fully vested.
    // Vested should be 300. Unvested 600. Inside vault: 900 * 10^6
    setClock(svm, BASE_TIME + THIRTY_DAYS + 1);    
    
    // Check initial vault balance = 900 * 10^6
    assert.strictEqual(getTokenBalance(svm, vestingVault), BigInt(totalAmount.toNumber()));

    // 2. Call Revoke
    const ix = await program.methods
      .revoke()
      .accounts({
        grantor: grantor.publicKey,
        beneficiary: beneficiary.publicKey,
        vestingState: vestingStatePda,
        vestingVault,
        tokenMint: mintKp.publicKey,
        grantorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    svm.expireBlockhash();
    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = grantor.publicKey;
    tx.add(ix);
    tx.sign(grantor);
    
    const result = svm.sendTransaction(tx);
    assertSuccess(result, "revoke");

    // 3. Verify balances
    // Vault should have 300M remaining (the vested portion).
    const vaultBalance = getTokenBalance(svm, vestingVault);
    assert.strictEqual(vaultBalance, BigInt(TOKENS_PER_PERIOD * DECIMAL_MULTIPLIER), "Vault should keep vested tokens");

    // 4. Verify state is inactive
    const state = svm.getAccount(vestingStatePda);
    const data = Buffer.from(state!.data);
    // is_active offset: 8 (disc) + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 32 = 144
    assert.strictEqual(data[144], 0, "is_active should be 0 (false)");

    // 5. Verify revoked_at is updated
    // revoked_at offset: 144 (is_active) + 1 = 145. u64 LE.
    const revokedAt = data.readBigUInt64LE(145);
    const expectedCurrentTime = BigInt(BASE_TIME + THIRTY_DAYS + 1);
    assert.strictEqual(revokedAt, expectedCurrentTime, "revoked_at should be updated to current time");

    // 6. Verify total_amount updated to vested amount
    // total_amount offset: 8 + 32 + 32 + 8 + 8 + 8 = 96. u64 LE.
    const newTotal = data.readBigUInt64LE(96);
    assert.strictEqual(newTotal, BigInt(TOKENS_PER_PERIOD * DECIMAL_MULTIPLIER), "total_amount should be updated to vested amount");
  });

  it("✅ allows beneficiary to withdraw the remaining vested tokens after revoke", async () => {
    // Current time is still (cliff + period 1 + 1s).
    // Vault has 300M. Total amount is 300M. Withdrawn 0.
    // Beneficiary requests full 300 (raw, contract scales by decimals).
    
    const bProg = buildProgram(beneficiary);
    // init_if_needed creates ATA
    const beneficiaryAta = getAssociatedTokenAddressSync(mintKp.publicKey, beneficiary.publicKey, false, TOKEN_PROGRAM_ID);
    
    const ix = await bProg.methods
      .withdraw(new BN(TOKENS_PER_PERIOD * DECIMAL_MULTIPLIER))
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

    svm.expireBlockhash();
    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = beneficiary.publicKey;
    tx.add(ix);
    tx.sign(beneficiary);

    const result = svm.sendTransaction(tx);
    assertSuccess(result, "post-revoke withdraw");

    const balance = getTokenBalance(svm, beneficiaryAta);
    assert.strictEqual(balance, BigInt(TOKENS_PER_PERIOD * DECIMAL_MULTIPLIER), "Beneficiary got vested tokens");
    
    const vaultBal = getTokenBalance(svm, vestingVault);
    assert.strictEqual(vaultBal, BigInt(0), "Vault empty");
  });

  it("✅ allows closing the empty vault", async () => {
    // Vault is empty. Call Close.
    const ix = await program.methods
      .close()
      .accounts({
        grantor: grantor.publicKey,
        beneficiary: beneficiary.publicKey,
        vestingState: vestingStatePda,
        vestingVault,
        tokenMint: mintKp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    svm.expireBlockhash();
    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = grantor.publicKey;
    tx.add(ix);
    tx.sign(grantor);

    const result = svm.sendTransaction(tx);
    assertSuccess(result, "close");

    // Verify accounts closed
    assert.strictEqual(svm.getAccount(vestingStatePda), null, "State account closed");
    assert.strictEqual(svm.getAccount(vestingVault), null, "Vault account closed");
  });
});
