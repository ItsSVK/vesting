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
