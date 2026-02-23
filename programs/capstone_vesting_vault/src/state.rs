use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Copy)]
pub struct VestingState {
    pub grantor: Pubkey,
    pub beneficiary: Pubkey,
    pub start_time: u64,
    pub cliff_time: u64,
    pub vesting_end_time: u64,
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

        // Total number of periods in the full vesting schedule
        let total_duration = self.vesting_end_time.checked_sub(self.start_time)?;
        let total_periods = total_duration.checked_div(self.frequency)?;

        // Tokens unlocked per period
        let tokens_per_period = self.total_amount.checked_div(total_periods)?;

        let vested = completed_periods.checked_mul(tokens_per_period)?;
        Some(vested.min(self.total_amount))
    }
}
