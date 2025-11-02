/**
 * TypeScript sample with syntax errors
 */

// Valid function
export function validFunction() {
  return "valid";
}

// Syntax error: missing closing brace
export function errorFunction() {
  const x = 10;
  return x;
// Missing }

// Valid class (after error)
export class ValidClass {
  value: number = 0;
}
