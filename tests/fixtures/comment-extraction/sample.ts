// Single line comment before function

/**
 * JSDoc comment for add function
 * @param a First number
 * @param b Second number
 * @returns Sum of a and b
 */
export function add(a: number, b: number): number {
  // Inline comment
  return a + b; // End of line comment
}

/*
 * Multi-line block comment
 * describing the User class
 */
export class User {
  /** Property comment */
  name: string;

  /**
   * Constructor comment
   * @param name User name
   */
  constructor(name: string) {
    this.name = name;
  }

  // TODO: Implement user validation
  validate(): boolean {
    // FIXME: This is a placeholder implementation
    return this.name.length > 0;
  }

  // NOTE: This method should be optimized
  // HACK: Quick fix for performance issue
  process(): void {
    /* Implementation here */
  }
}

/**
 * Async function with JSDoc
 * @async
 * @throws {Error} When network request fails
 */
async function fetchData(): Promise<void> {
  // XXX: Temporary workaround
  // BUG: Known issue with error handling
  await fetch('/api/data');
}
