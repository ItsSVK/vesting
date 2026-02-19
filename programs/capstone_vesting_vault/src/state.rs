use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Copy)]
pub struct VestingState {
    pub grantor: Pubkey,
    pub beneficiary: Pubkey,
    pub start_time: u64,
    pub cliff_time: u64,
    pub vesting_duration: u64,
    pub total_amount: u64,
    pub total_withdrawn: u64,
    pub token_mint: Pubkey,
    pub is_active: bool,
    pub frequency: u64,
    pub bump: u8,
}

impl VestingState {
    pub fn vested_amount(&self, current_time: u64) -> Option<u64> {
        if current_time < self.cliff_time {
            return Some(0);
        }

        let time_elapsed = current_time.checked_sub(self.cliff_time)?;
        let completed_periods = time_elapsed.checked_div(self.frequency)?;

        let tokens_per_period = self
            .total_amount
            .checked_mul(self.frequency)?
            .checked_div(self.vesting_duration)?;

        let vested = completed_periods.checked_mul(tokens_per_period)?;
        Some(vested.min(self.total_amount))
    }
}
