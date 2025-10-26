export const PDP1_MEMORY_BANK_SIZE = 4096;
export const PDP1_WORD_LENGTH = 18;
export const PDP1_WORD_MASK = (1 << PDP1_WORD_LENGTH) - 1;
export const PDP1_NEG_ZERO = (1 << PDP1_WORD_LENGTH) - 1;
export const PDP1_SIGN_BIT_MASK = 1 << PDP1_WORD_LENGTH - 1;
export const PDP1_UNSIGNED_MASK = PDP1_SIGN_BIT_MASK - 1;
export const PDP1_MEMORY_EXTENSION_MASK = 0o170000;
export const PDP1_MEMORY_ADDRESS_MASK = 0o7777;
export const PDP1_MEMORY_ACCESS_DURATION = 5;  // microseconds

export const PDP1_DEV = false;