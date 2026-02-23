use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{VestingError, VestingState};

#[derive(Accounts)]
pub struct Revoke<'info> {
    #[account(mut)]
    pub grantor: Signer<'info>,
    pub beneficiary: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"vesting_state", grantor.key().as_ref(), beneficiary.key().as_ref()],
        bump = vesting_state.bump,
        has_one = grantor,
        constraint = vesting_state.is_active == true @ VestingError::VestingInactive
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
        payer = grantor,
        associated_token::mint = token_mint,
        associated_token::authority = grantor,
        associated_token::token_program = token_program
    )]
    pub grantor_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Revoke>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    let state = &ctx.accounts.vesting_state;

    // How much has vested up to this moment
    let vested_amount = state.vested_amount(now).unwrap_or(0);

    // How much the beneficiary has already withdrawn
    let already_withdrawn = state.total_withdrawn;

    // Remaining vested-but-not-yet-withdrawn tokens stay in vault for beneficiary
    let claimable_by_beneficiary = vested_amount.saturating_sub(already_withdrawn);

    // Actual tokens sitting in the vault right now
    let vault_balance = ctx.accounts.vesting_vault.amount;

    // Unvested = vault balance minus what's still owed to the beneficiary
    let unvested_amount = vault_balance.saturating_sub(claimable_by_beneficiary);

    // If there's unvested amount, transfer it back to grantor
    if unvested_amount > 0 {
        let signer_seeds = [
            b"vesting_state".as_ref(),
            ctx.accounts.grantor.key.as_ref(),
            ctx.accounts.beneficiary.key.as_ref(),
            &[ctx.accounts.vesting_state.bump],
        ];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vesting_vault.to_account_info(),
                    to: ctx.accounts.grantor_ata.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    authority: ctx.accounts.vesting_state.to_account_info(),
                },
                &[&signer_seeds[..]],
            ),
            unvested_amount,
            ctx.accounts.token_mint.decimals,
        )?;
    }

    // Update state to reflect revocation.
    // total_amount is now the ceiling the beneficiary can still claim.
    ctx.accounts.vesting_state.total_amount = vested_amount;
    ctx.accounts.vesting_state.is_active = false;

    Ok(())
}
