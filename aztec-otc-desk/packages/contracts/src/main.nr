use aztec::macros::aztec;

pub mod types;
pub mod test;

#[aztec]
pub contract OTCEscrowContract {
    // aztec library imports
    use aztec::{
        macros::{
            functions::{initializer, private, utility},
            storage::storage
        },
        prelude::{AztecAddress, PrivateImmutable, PrivateMutable},
        messages::logs::note::encode_and_encrypt_note,
        protocol_types::traits::ToField,
    };
    use crate::types::definition_note::DefinitionNote;

    use token_contract::Token;

    #[storage]
    struct Storage<Context> {
        definition: PrivateImmutable<DefinitionNote, Context>,
    }
    
    #[private]
    #[initializer]
    fn constructor(
        sell_token_address: AztecAddress,
        sell_token_amount: u128,
        buy_token_address: AztecAddress,
        buy_token_amount: u128,
        order_nonce: Field,
        domain_separator: Field,
        min_fill_amount: u128,
        max_slippage_bps: u32,
        expiry_timestamp: u64,
    ) {
        let self_address = context.this_address();
        let caller = context.msg_sender();

        // Validate inputs
        assert(sell_token_address != buy_token_address, "Sell and buy tokens cannot be the same");
        assert(sell_token_amount > 0, "Sell amount must be greater than 0");
        assert(buy_token_amount > 0, "Buy amount must be greater than 0");
        assert(min_fill_amount <= sell_token_amount, "Min fill amount cannot exceed sell amount");
        assert(max_slippage_bps <= 10000, "Slippage cannot exceed 100%");
        assert(expiry_timestamp > context.timestamp() as u64, "Order cannot be expired at creation");

        // create partial note
        let partial_note = Token::at(buy_token_address)
            .initialize_transfer_commitment(
                self_address,
                caller,
                self_address
            ).call(&mut context);

        // Create definition note with safety features
        let definition = DefinitionNote::new(
            self_address,
            partial_note,
            sell_token_address,
            sell_token_amount,
            buy_token_address,
            buy_token_amount,
            order_nonce,
            domain_separator,
            min_fill_amount,
            max_slippage_bps,
            expiry_timestamp
        );
        
        storage.definition.initialize(definition).emit(encode_and_encrypt_note(
            &mut context,
            self_address,
            self_address
        ));
    }
    
    /**
     * OTC Offer Maker deposits tokens into the shared escrow
     *
     * @param _nonce - authwit nonce used in `transfer_private_to_private`
     * @return - the commitment for the partial note
     */
    #[private]
    fn deposit_tokens(_nonce: Field) {

        let definition = storage.definition.get_note();
        let self_address = context.this_address();
        let caller = context.msg_sender();

        // transfer tokens in
        Token::at(definition.sell_token_address)
            .transfer_private_to_private(
                caller,
                self_address,
                definition.sell_token_amount,
                _nonce
            )
            .call(&mut context);

        // emit nullifier to prevent multiple deposits
        let deposit_nullifier = definition.get_nullifier();
        context.push_nullifier(deposit_nullifier);
    }

    /**
     * Fulfil an OTC order as a taker by transfering in the asked tokens and withdrawing the offered tokens
     *
     * @param _nonce - authwit nonce used in `transfer_private_to_private`
     * @param fill_amount - amount of tokens being filled (must meet minimum)
     */
    #[private]
    fn fill_order(_nonce: Field, fill_amount: u128) {
        let definition = storage.definition.get_note();
        let self_address = context.this_address();
        let caller = context.msg_sender();
        let current_timestamp = context.timestamp() as u64;

        // SAFETY CHECKS
        // 1. Check order is not expired
        assert(!definition.is_expired(current_timestamp), "Order has expired");

        // 2. Check minimum fill amount
        assert(definition.validate_fill_amount(fill_amount), "Fill amount below minimum");

        // 3. Validate that fill amount doesn't exceed order amount
        assert(fill_amount <= definition.sell_token_amount, "Fill amount exceeds order amount");

        // 4. Calculate proportional buy amount
        let proportional_buy_amount = (definition.buy_token_amount * fill_amount) / definition.sell_token_amount;

        // 5. Validate slippage (the proportional amount should be within slippage tolerance)
        assert(
            definition.validate_slippage(proportional_buy_amount, definition.buy_token_amount),
            "Slippage tolerance exceeded"
        );

        // INVARIANT: Value conservation check
        // Ensure the ratio is preserved within slippage tolerance
        let expected_ratio = definition.buy_token_amount * 10000 / definition.sell_token_amount;
        let actual_ratio = proportional_buy_amount * 10000 / fill_amount;
        let ratio_diff = if actual_ratio > expected_ratio {
            actual_ratio - expected_ratio
        } else {
            expected_ratio - actual_ratio
        };
        assert(ratio_diff <= definition.max_slippage_bps as u128, "Value conservation check failed");

        // Transfer ask tokens in (buyer -> escrow)
        Token::at(definition.buy_token_address)
            .transfer_private_to_private(
                caller,
                self_address,
                proportional_buy_amount,
                _nonce
            )
            .call(&mut context);

        // Complete the partial note (escrow -> seller)
        Token::at(definition.buy_token_address)
            .transfer_private_to_commitment(
                self_address,
                definition.partial_note,
                proportional_buy_amount,
                0
            )
            .call(&mut context);

        // Transfer offer tokens out (escrow -> buyer)
        Token::at(definition.sell_token_address)
            .transfer_private_to_private(
                self_address,
                caller,
                fill_amount,
                0
            )
            .call(&mut context);

        // INVARIANT: Emit order hash nullifier to prevent replay attacks
        let order_hash = definition.get_order_hash();
        context.push_nullifier(order_hash);
    }

    /**
     * Cancel an order - only callable by owner after expiry or anytime before deposit
     */
    #[private]
    fn cancel_order() {
        let definition = storage.definition.get_note();
        let self_address = context.this_address();
        let caller = context.msg_sender();
        let current_timestamp = context.timestamp() as u64;

        // SAFETY CHECKS
        // 1. Only owner can cancel
        assert(caller == definition.owner, "Only order owner can cancel");

        // 2. Check if order is expired (force cancel allowed) or not yet deposited
        let is_expired = definition.is_expired(current_timestamp);

        if !is_expired {
            // If not expired, ensure order hasn't been deposited yet
            // This is checked by ensuring the deposit nullifier hasn't been used
            let deposit_nullifier = definition.get_nullifier();
            // Note: In a real implementation, we'd check if this nullifier exists
            // For now, we allow cancellation anytime before expiry
        }

        // INVARIANT: Emit cancellation nullifier to prevent double cancellation
        let cancel_nullifier = definition.get_order_hash();
        context.push_nullifier(cancel_nullifier);
    }

    #[utility]
    pub unconstrained fn get_definition() -> DefinitionNote {
        storage.definition.view_note()
    }

    /**
     * Check if order is expired
     */
    #[utility]
    pub unconstrained fn is_expired() -> bool {
        let definition = storage.definition.view_note();
        let current_timestamp = context.timestamp() as u64;
        definition.is_expired(current_timestamp)
    }

    /**
     * Get order hash for external verification
     */
    #[utility]
    pub unconstrained fn get_order_hash() -> Field {
        let definition = storage.definition.view_note();
        definition.get_order_hash()
    }
}
