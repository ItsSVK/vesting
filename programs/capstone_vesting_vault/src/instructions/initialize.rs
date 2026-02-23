use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::VestingError;
use crate::VestingState;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TimeUnit {
    Sec,
    Min,
    Hour,
    Day,
    Week,
    Month,
    Year,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub grantor: Signer<'info>,
    #[account(constraint = grantor.key() != beneficiary.key() @ VestingError::GrantorIsBeneficiary)]
    pub beneficiary: SystemAccount<'info>,
    #[account(
        mint::token_program = token_program
    )]
    pub token_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = grantor,
        associated_token::token_program = token_program
    )]
    pub grantor_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = grantor,
        seeds = [b"vesting_state", grantor.key().as_ref(), beneficiary.key().as_ref()],
        space = VestingState::DISCRIMINATOR.len() + VestingState::INIT_SPACE,
        bump
    )]
    pub vesting_state: Account<'info, VestingState>,

    #[account(
        init,
        payer = grantor,
        associated_token::mint = token_mint,
        associated_token::authority = vesting_state,
        associated_token::token_program = token_program
    )]
    pub vesting_vault: InterfaceAccount<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    cliff_duration: u64,
    vesting_duration: u64,
    total_amount: u64,
    frequency: u64,
    unit: TimeUnit,
) -> Result<()> {
    let start_time = Clock::get()?.unix_timestamp as u64;
    require_gt!(total_amount, 0, VestingError::ZeroAmount);

    require_gt!(frequency, 0, VestingError::ZeroFrequency);
    require_gt!(vesting_duration, 0, VestingError::ZeroDuration);
    require_gt!(cliff_duration, 0, VestingError::ZeroCliffTime);

    require_gte!(
        vesting_duration,
        frequency,
        VestingError::FrequencyExceedsVestingDuration
    );

    require_gt!(
        vesting_duration,
        cliff_duration,
        VestingError::CliffExceedsVestingEnd
    );
    // require_gte!(cliff_duration, start_time, VestingError::InvalidCliffTime);

    let total_amount = total_amount * 10u64.pow(ctx.accounts.token_mint.decimals as u32);

    let multiplier = match unit {
        TimeUnit::Sec => 1,
        TimeUnit::Min => 60,
        TimeUnit::Hour => 60 * 60,
        TimeUnit::Day => 60 * 60 * 24,
        TimeUnit::Week => 60 * 60 * 24 * 7,
        TimeUnit::Month => 60 * 60 * 24 * 30,
        TimeUnit::Year => 60 * 60 * 24 * 365,
    };

    let vesting_duration = vesting_duration * multiplier;
    let frequency = frequency * multiplier;
    let cliff_duration = cliff_duration * multiplier;
    // let start_time = start_time * multiplier;

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.grantor_ata.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.vesting_vault.to_account_info(),
                authority: ctx.accounts.grantor.to_account_info(),
            },
        ),
        total_amount,
        ctx.accounts.token_mint.decimals,
    )?;

    ctx.accounts.vesting_state.set_inner(VestingState {
        grantor: ctx.accounts.grantor.key(),
        beneficiary: ctx.accounts.beneficiary.key(),
        start_time,
        cliff_time: start_time + cliff_duration,
        vesting_end_time: start_time + vesting_duration,
        total_amount,
        total_withdrawn: 0,
        token_mint: ctx.accounts.token_mint.key(),
        is_active: true,
        frequency,
        bump: ctx.bumps.vesting_state,
    });

    Ok(())
}
