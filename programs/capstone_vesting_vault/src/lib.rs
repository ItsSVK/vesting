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

declare_id!("F4sps74oJaGCmos1mZNUsa98nb4zrp55gmQEtY4FPHt6");

#[program]
pub mod capstone_vesting_vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        start_time: u64,
        cliff_time: u64,
        vesting_duration: u64,
        total_amount: u64,
        frequency: u64,
    ) -> Result<()> {
        initialize::handler(
            ctx,
            start_time,
            cliff_time,
            vesting_duration,
            total_amount,
            frequency,
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
