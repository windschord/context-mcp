/**
 * TypeScript sample code for AST parsing tests
 */

// Type definition
type User = {
  id: number;
  name: string;
  email?: string;
};

// Interface definition
interface Repository {
  name: string;
  stars: number;
  fork(): void;
}

// Class definition
export class UserManager {
  private users: User[] = [];

  constructor(initialUsers: User[] = []) {
    this.users = initialUsers;
  }

  addUser(user: User): void {
    this.users.push(user);
  }

  getUserById(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }

  get userCount(): number {
    return this.users.length;
  }
}

// Function definition
export function calculateTotal(items: number[]): number {
  return items.reduce((sum, item) => sum + item, 0);
}

// Arrow function
const greet = (name: string): string => {
  return `Hello, ${name}!`;
};

// Async function
async function fetchUserData(userId: number): Promise<User> {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
}
