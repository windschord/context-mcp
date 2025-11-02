package main

import "fmt"

// User represents a user in the system
type User struct {
	ID       int
	Name     string
	Email    string
	IsActive bool
}

// NewUser creates a new user instance
func NewUser(id int, name string, email string) *User {
	return &User{
		ID:       id,
		Name:     name,
		Email:    email,
		IsActive: true,
	}
}

// Greet returns a greeting message for the user
func (u *User) Greet() string {
	return fmt.Sprintf("Hello, %s!", u.Name)
}

// Deactivate marks the user as inactive
func (u *User) Deactivate() {
	u.IsActive = false
}

// IsValidEmail checks if the email is valid
func IsValidEmail(email string) bool {
	// Simple validation for demonstration
	return len(email) > 0 && contains(email, "@")
}

// contains checks if a string contains a substring
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func main() {
	user := NewUser(1, "John Doe", "john@example.com")
	fmt.Println(user.Greet())
}
