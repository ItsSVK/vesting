use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{VestingError, VestingState};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    pub grantor: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"vesting_state", grantor.key().as_ref(), beneficiary.key().as_ref()],
        bump
    )]
    pub vesting_state: Account<'info, VestingState>,
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = vesting_state,
        associated_token::token_program = token_program
    )]
    pub vesting_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mint::token_program = token_program
    )]
    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = beneficiary,
        associated_token::mint = token_mint,
        associated_token::authority = beneficiary,
        associated_token::token_program = token_program
    )]
    pub beneficiary_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    require_gte!(
        now,
        ctx.accounts.vesting_state.cliff_time,
        VestingError::CliffNotPassed
    );

    require!(
        ctx.accounts.vesting_state.is_active,
        VestingError::VestingInactive
    );

    let state = &ctx.accounts.vesting_state;

    // How many full frequency periods have elapsed since cliff
    let time_elapsed = now - state.cliff_time;
    let completed_periods = time_elapsed / state.frequency;

    // Tokens unlocked per period: multiply before divide to preserve u64 precision
    // tokens_per_period = total_amount * frequency / vesting_duration
    let tokens_per_period = state
        .total_amount
        .checked_mul(state.frequency)
        .unwrap()
        .checked_div(state.vesting_duration)
        .unwrap();

    // Total vested so far = completed periods × tokens per period, capped at total_amount
    let vested_till_now = (completed_periods * tokens_per_period).min(state.total_amount);

    let available_to_withdraw = vested_till_now - state.total_withdrawn;

    require_gte!(
        available_to_withdraw,
        amount,
        VestingError::InsufficientBalance
    );

    // Cpi Transfer
    let signer_seeds = [
        b"vesting_state".as_ref(),
        ctx.accounts.grantor.key.as_ref(),
        ctx.accounts.beneficiary.key.as_ref(),
        &[ctx.bumps.vesting_state],
    ];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vesting_vault.to_account_info(),
                to: ctx.accounts.beneficiary_ata.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                authority: ctx.accounts.vesting_state.to_account_info(),
            },
            &[&signer_seeds[..]],
        ),
        amount,
        ctx.accounts.token_mint.decimals,
    )?;

    // Update state directly (local copy would not persist on-chain)
    ctx.accounts.vesting_state.total_withdrawn += amount;

    Ok(())
}
