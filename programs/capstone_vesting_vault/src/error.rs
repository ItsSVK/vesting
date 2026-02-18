use anchor_lang::prelude::*;

#[error_code]
pub enum VestingError {
    #[msg("Custom error message")]
    CustomError,
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
}
