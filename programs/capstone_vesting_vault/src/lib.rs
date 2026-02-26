#![allow(unexpected_cfgs)]
pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("AD8rbtNK1GW3u6yVJxr3zGKf2hhTuGs9zCmsidhpR982");

#[program]
pub mod capstone_vesting_vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        cliff_duration: u64,
        vesting_duration: u64,
        total_amount: u64,
        frequency: u64,
        unit: TimeUnit,
    ) -> Result<()> {
        initialize::handler(
            ctx,
            cliff_duration,
            vesting_duration,
            total_amount,
            frequency,
            unit,
        )
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        withdraw::handler(ctx, amount)
    }

    pub fn revoke(ctx: Context<Revoke>) -> Result<()> {
        revoke::handler(ctx)
    }

    pub fn close(ctx: Context<Close>) -> Result<()> {
        close::handler(ctx)
    }
}
