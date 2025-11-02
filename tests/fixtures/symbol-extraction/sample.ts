/**
 * Sample TypeScript code for symbol extraction testing
 */

// Global constant
export const API_VERSION = '1.0.0';

// Global variable
let globalCounter = 0;

/**
 * A simple interface for users
 */
export interface User {
  id: number;
  name: string;
  email?: string;
}

/**
 * Base class for animals
 */
export abstract class Animal {
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  abstract makeSound(): string;

  getName(): string {
    return this.name;
  }
}

/**
 * Dog class extending Animal
 */
export class Dog extends Animal {
  private breed: string;

  constructor(name: string, breed: string) {
    super(name);
    this.breed = breed;
  }

  makeSound(): string {
    return 'Woof!';
  }

  getBreed(): string {
    return this.breed;
  }
}

/**
 * Async function to fetch user data
 */
export async function fetchUser(id: number): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

/**
 * Regular function with optional parameter
 */
function greet(name: string, greeting: string = 'Hello'): string {
  return `${greeting}, ${name}!`;
}

/**
 * Arrow function
 */
const multiply = (a: number, b: number): number => a * b;

// Type alias
type Status = 'active' | 'inactive';

// Enum
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
