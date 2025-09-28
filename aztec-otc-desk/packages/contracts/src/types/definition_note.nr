use aztec::{
    macros::notes::note,
    oracle::random::random,
    prelude::AztecAddress,
    protocol_types::traits::{Deserialize, Serialize},
};
use poseidon::poseidon2::Poseidon2;


#[note]
#[derive(Eq, Serialize, Deserialize)]
pub struct DefinitionNote {
    owner: AztecAddress,
    partial_note: Field,
    sell_token_address: AztecAddress,
    sell_token_amount: u128,
    buy_token_address: AztecAddress,
    buy_token_amount: u128,
    // Safety features
    order_nonce: Field,
    domain_separator: Field,
    min_fill_amount: u128,
    max_slippage_bps: u32, // basis points (100 = 1%)
    expiry_timestamp: u64,
    randomness: Field,
}

impl DefinitionNote {
    pub fn new(
        owner: AztecAddress,
        partial_note: Field,
        sell_token_address: AztecAddress,
        sell_token_amount: u128,
        buy_token_address: AztecAddress,
        buy_token_amount: u128,
        order_nonce: Field,
        domain_separator: Field,
        min_fill_amount: u128,
        max_slippage_bps: u32,
        expiry_timestamp: u64,
    ) -> Self {
        DefinitionNote {
            owner,
            partial_note,
            sell_token_address,
            sell_token_amount,
            buy_token_address,
            buy_token_amount,
            order_nonce,
            domain_separator,
            min_fill_amount,
            max_slippage_bps,
            expiry_timestamp,
            randomness: unsafe { random() }
        }
    }

    pub fn get_nullifier(self) -> Field {
        let preimage = self.serialize();
        Poseidon2::hash(preimage, preimage.len())
    }

    // Safety validation methods
    pub fn is_expired(self, current_timestamp: u64) -> bool {
        current_timestamp > self.expiry_timestamp
    }

    pub fn validate_fill_amount(self, fill_amount: u128) -> bool {
        fill_amount >= self.min_fill_amount
    }

    pub fn validate_slippage(self, actual_amount: u128, expected_amount: u128) -> bool {
        if expected_amount == 0 {
            return false;
        }

        let max_deviation = (expected_amount * self.max_slippage_bps as u128) / 10000;
        let lower_bound = expected_amount - max_deviation;
        let upper_bound = expected_amount + max_deviation;

        actual_amount >= lower_bound && actual_amount <= upper_bound
    }

    pub fn get_order_hash(self) -> Field {
        // Create a unique hash for this order that includes domain separator and nonce
        let order_data = [
            self.domain_separator,
            self.order_nonce,
            self.sell_token_address.to_field(),
            self.sell_token_amount as Field,
            self.buy_token_address.to_field(),
            self.buy_token_amount as Field,
            self.expiry_timestamp as Field
        ];
        Poseidon2::hash(order_data, order_data.len())
    }

    pub fn get_fill_nullifier(self, caller: AztecAddress, fill_amount: u128, timestamp: u64) -> Field {
        // Create a unique nullifier for each fill attempt to prevent reentrancy
        let fill_data = [
            self.get_order_hash(),
            caller.to_field(),
            fill_amount as Field,
            timestamp as Field,
            self.randomness // Include randomness for additional uniqueness
        ];
        Poseidon2::hash(fill_data, fill_data.len())
    }

    pub fn get_cancel_nullifier(self, caller: AztecAddress, timestamp: u64) -> Field {
        // Create a unique nullifier for cancellation attempts to prevent reentrancy
        let cancel_data = [
            self.get_order_hash(),
            caller.to_field(),
            timestamp as Field,
            0x43414e43454c, // "CANCEL" in hex for unique domain separation
            self.randomness
        ];
        Poseidon2::hash(cancel_data, cancel_data.len())
    }
}
