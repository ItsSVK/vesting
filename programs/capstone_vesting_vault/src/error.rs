use anchor_lang::prelude::*;

#[error_code]
pub enum VestingError {
    #[msg("Account is not empty")]
    NotZero,
    #[msg("Amount cant be zero")]
    ZeroAmount,
    #[msg("Duration cant be zero")]
    ZeroDuration,
    #[msg("Cliff time has to be greater than Start time")]
    InvalidCliffTime,
    CliffExceedsVestingEnd,
    #[msg("Grantor cant be the Beneficiary")]
    GrantorIsBeneficiary,
    InsufficientBalance,
    InvalidStartTime,
    #[msg("Cliff time hasn't pass")]
    CliffNotPassed,
    #[msg("Vesting is Inactive")]
    VestingInactive,
    #[msg("Frequency cant be zero")]
    ZeroFrequency,
}
