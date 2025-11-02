# Sample Project

This is a sample project for testing LSP-MCP integration.

## Overview

The project contains example code in multiple programming languages:
- TypeScript: `src/calculator.ts`
- Python: `src/utils.py`
- Go: `src/main.go`

## Features

### Calculator Module

The calculator module provides basic arithmetic operations. See `src/calculator.ts` for implementation details.

Main features:
- Addition with `add()` function
- Subtraction with `subtract()` function
- Multiplication with `multiply()` function
- Division with `divide()` function (includes zero division check)
- Factorial calculation with `factorial()` function

### String Utilities

Python utilities for string manipulation. The `StringProcessor` class provides:
- Text case conversion
- Word counting
- String reversal with `reverse_string()`

### User Management

Go implementation of user management. The `User` struct includes:
- User creation with `NewUser()`
- Greeting functionality
- Email validation with `IsValidEmail()`

## Usage Examples

### TypeScript Calculator

```typescript
import { Calculator } from './calculator';

const calc = new Calculator();
const result = calc.add(5, 3); // Returns 8
```

### Python String Processing

```python
from utils import StringProcessor

processor = StringProcessor("Hello World")
upper = processor.to_upper() # Returns "HELLO WORLD"
```

### Go User Management

```go
user := NewUser(1, "John Doe", "john@example.com")
greeting := user.Greet()
```
