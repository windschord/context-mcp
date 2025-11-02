/**
 * A simple calculator class for basic arithmetic operations
 */
export class Calculator {
  /**
   * Adds two numbers together
   * @param a - First number
   * @param b - Second number
   * @returns The sum of a and b
   */
  add(a: number, b: number): number {
    return a + b;
  }

  /**
   * Subtracts b from a
   * @param a - First number
   * @param b - Second number
   * @returns The difference between a and b
   */
  subtract(a: number, b: number): number {
    return a - b;
  }

  /**
   * Multiplies two numbers
   * @param a - First number
   * @param b - Second number
   * @returns The product of a and b
   */
  multiply(a: number, b: number): number {
    return a * b;
  }

  /**
   * Divides a by b
   * @param a - First number (dividend)
   * @param b - Second number (divisor)
   * @returns The quotient of a and b
   * @throws Error if b is zero
   */
  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error('Division by zero is not allowed');
    }
    return a / b;
  }
}

/**
 * Calculates the factorial of a number
 * @param n - The number to calculate factorial for
 * @returns The factorial of n
 */
export function factorial(n: number): number {
  if (n < 0) {
    throw new Error('Factorial is not defined for negative numbers');
  }
  if (n === 0 || n === 1) {
    return 1;
  }
  return n * factorial(n - 1);
}
