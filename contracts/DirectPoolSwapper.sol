// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DirectPoolSwapper
 * @notice Bypasses the Algebra router's pool address computation issue
 * @dev Calls pool.swap() directly with the correct pool address
 */
interface IAlgebraPool {
    function swap(
        address recipient,
        bool zeroToOne,
        int256 amountRequired,
        uint160 limitSqrtPrice,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
    
    function token0() external view returns (address);
    function token1() external view returns (address);
}

contract DirectPoolSwapper {
    /// @notice Callback for Algebra pool swaps
    /// @dev Called by the pool after the swap to collect payment
    function algebraSwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external {
        // The pool that called us
        address pool = msg.sender;
        
        // Decode the payer from data
        address payer = abi.decode(data, (address));
        
        // Determine which token we owe
        if (amount0Delta > 0) {
            address token0 = IAlgebraPool(pool).token0();
            // Transfer tokens from payer to pool
            // Note: payer must have approved this contract
            IERC20(token0).transferFrom(payer, pool, uint256(amount0Delta));
        }
        if (amount1Delta > 0) {
            address token1 = IAlgebraPool(pool).token1();
            IERC20(token1).transferFrom(payer, pool, uint256(amount1Delta));
        }
    }
    
    /**
     * @notice Execute a swap on a specific pool
     * @param pool The pool address to swap on
     * @param zeroToOne True if swapping token0 for token1
     * @param amountIn The amount to swap (positive = exact input)
     * @param limitSqrtPrice Price limit (0 = no limit)
     * @return amount0 The delta of token0
     * @return amount1 The delta of token1
     */
    function swap(
        address pool,
        bool zeroToOne,
        int256 amountIn,
        uint160 limitSqrtPrice
    ) external returns (int256 amount0, int256 amount1) {
        // Encode msg.sender as the payer for the callback
        bytes memory data = abi.encode(msg.sender);
        
        // Call the pool directly
        (amount0, amount1) = IAlgebraPool(pool).swap(
            msg.sender, // recipient gets the output tokens
            zeroToOne,
            amountIn, // positive = exact input
            limitSqrtPrice == 0 
                ? (zeroToOne ? 4295128740 : 1461446703485210103287273052203988822378723970341) 
                : limitSqrtPrice,
            data
        );
    }
    
    /**
     * @notice Get a quote for a swap (will revert with amounts)
     */
    function quoteSwap(
        address pool,
        bool zeroToOne,
        int256 amountIn
    ) external returns (int256 amount0, int256 amount1) {
        try this.swap(pool, zeroToOne, amountIn, 0) returns (int256 a0, int256 a1) {
            return (a0, a1);
        } catch {
            revert("Quote failed");
        }
    }
}
