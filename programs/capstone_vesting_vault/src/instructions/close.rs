use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{close_account, CloseAccount, Mint, TokenAccount, TokenInterface},
};

use crate::{VestingError, VestingState};

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut)]
    pub grantor: Signer<'info>,
    pub beneficiary: SystemAccount<'info>,
    #[account(
        mut,
        close = grantor,
        seeds = [
            b"vesting_state",
            grantor.key().as_ref(),
            beneficiary.key().as_ref(),
            token_mint.key().as_ref()
        ],
        bump = vesting_state.bump,
        has_one = grantor
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

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Close>) -> Result<()> {
    // Prevent closing while there are still tokens in the vault.
    // Grantor must wait until beneficiary has fully withdrawn (or call revoke first).
    require_eq!(
        ctx.accounts.vesting_vault.amount,
        0u64,
        VestingError::NotZero
    );

    // Determine seeds for signing
    let token_mint_key = ctx.accounts.token_mint.key();
    let signer_seeds = [
        b"vesting_state".as_ref(),
        ctx.accounts.grantor.key.as_ref(),
        ctx.accounts.beneficiary.key.as_ref(),
        token_mint_key.as_ref(),
        &[ctx.accounts.vesting_state.bump],
    ];

    // Close the vault account (transfer rent to grantor)
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vesting_vault.to_account_info(),
            destination: ctx.accounts.grantor.to_account_info(),
            authority: ctx.accounts.vesting_state.to_account_info(),
        },
        &[&signer_seeds[..]],
    ))?;

    // The vesting_state account is closed automatically by the `close = grantor` constraint

    Ok(())
}
