# API Documentation

## Calculator API

### Class: Calculator

Located in `src/calculator.ts`

#### Methods

##### add(a: number, b: number): number

Adds two numbers together.

**Parameters:**
- `a` - First number
- `b` - Second number

**Returns:** The sum of a and b

##### subtract(a: number, b: number): number

Subtracts b from a.

##### multiply(a: number, b: number): number

Multiplies two numbers.

##### divide(a: number, b: number): number

Divides a by b. Throws an error if b is zero.

**Throws:** Error if division by zero

### Function: factorial(n: number): number

Calculates the factorial of a number recursively.

**Parameters:**
- `n` - The number to calculate factorial for

**Returns:** The factorial of n

**Throws:** Error if n is negative

## Python Utils API

### Module: utils

Located in `src/utils.py`

#### Functions

##### reverse_string(s: str) -> str

Reverses a string.

##### find_max(numbers: list) -> int

Finds the maximum number in a list.

#### Class: StringProcessor

Text processing class.

**Constructor:**
- `__init__(text: str)` - Initialize with text

**Methods:**
- `to_upper()` - Convert to uppercase
- `to_lower()` - Convert to lowercase
- `word_count()` - Count words

## Go User API

### Package: main

Located in `src/main.go`

#### Type: User

Represents a user in the system.

**Fields:**
- `ID` - User identifier
- `Name` - User name
- `Email` - User email
- `IsActive` - Active status

#### Functions

##### NewUser(id int, name string, email string) *User

Creates a new user instance.

##### IsValidEmail(email string) bool

Validates an email address.

#### Methods

##### (u *User) Greet() string

Returns a greeting message.

##### (u *User) Deactivate()

Marks the user as inactive.
