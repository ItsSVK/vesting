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
        seeds = [
            b"vesting_state",
            grantor.key().as_ref(),
            beneficiary.key().as_ref(),
            token_mint.key().as_ref()
        ],
        bump = vesting_state.bump,
        has_one = grantor,
        has_one = beneficiary
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

    let state = &ctx.accounts.vesting_state;

    // Logic:
    // If active: calculate time-based vested amount.
    // If inactive (revoked): everything remaining in the vault (up to total_amount) is vested.
    // We assume revoke instruction updates total_amount to reflect the final vested amount.

    let vested_amount = if state.is_active {
        require_gte!(now, state.cliff_time, VestingError::CliffNotPassed);
        state.vested_amount(now).unwrap()
    } else {
        state.total_amount
    };

    let available_to_withdraw = vested_amount.saturating_sub(state.total_withdrawn);

    require_gte!(
        available_to_withdraw,
        amount,
        VestingError::InsufficientBalance
    );

    // Cpi Transfer
    let token_mint_key = ctx.accounts.token_mint.key();
    let signer_seeds = [
        b"vesting_state".as_ref(),
        ctx.accounts.grantor.key.as_ref(),
        ctx.accounts.beneficiary.key.as_ref(),
        token_mint_key.as_ref(),
        &[ctx.accounts.vesting_state.bump],
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
