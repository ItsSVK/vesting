use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::VestingState;
use crate::{VestingCounter, VestingError};

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
        init_if_needed,
        payer = grantor,
        seeds = [
            b"vesting_counter",
            grantor.key().as_ref(),
            beneficiary.key().as_ref(),
            token_mint.key().as_ref()
        ],
        space = VestingCounter::LEN,
        bump
    )]
    pub vesting_counter: Account<'info, VestingCounter>,

    #[account(
        init,
        payer = grantor,
        seeds = [
            b"vesting_state",
            grantor.key().as_ref(),
            beneficiary.key().as_ref(),
            token_mint.key().as_ref(),
            &vesting_counter.counter.to_le_bytes()
        ],
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
    let vesting_id = ctx.accounts.vesting_counter.get_counter();

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

    let multiplier = match unit {
        TimeUnit::Sec => 1,
        TimeUnit::Min => 60,
        TimeUnit::Hour => 60 * 60,
        TimeUnit::Day => 60 * 60 * 24,
        TimeUnit::Week => 60 * 60 * 24 * 7,
        TimeUnit::Month => 60 * 60 * 24 * 30,
        TimeUnit::Year => 60 * 60 * 24 * 365,
    };

    let vesting_duration = vesting_duration
        .checked_mul(multiplier)
        .ok_or(VestingError::MathOverflow)?;
    let frequency = frequency
        .checked_mul(multiplier)
        .ok_or(VestingError::MathOverflow)?;
    let cliff_duration = cliff_duration
        .checked_mul(multiplier)
        .ok_or(VestingError::MathOverflow)?;
    let cliff_time = start_time
        .checked_add(cliff_duration)
        .ok_or(VestingError::MathOverflow)?;
    let vesting_end_time = start_time
        .checked_add(vesting_duration)
        .ok_or(VestingError::MathOverflow)?;
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
        cliff_time,
        vesting_end_time,
        total_amount,
        total_withdrawn: 0,
        token_mint: ctx.accounts.token_mint.key(),
        is_active: true,
        revoked_at: 0,
        frequency,
        vesting_id,
        bump: ctx.bumps.vesting_state,
    });

    let next_counter = vesting_id
        .checked_add(1)
        .ok_or(VestingError::VestingCounterOverflow)?;
    ctx.accounts.vesting_counter.set_counter(next_counter);

    Ok(())
}
