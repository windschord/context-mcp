package main

// Single line comment before function

// Add performs addition of two integers
// Returns the sum of a and b
func Add(a int, b int) int {
	// Inline comment
	return a + b // End of line comment
}

/*
Multi-line block comment
describing the User struct
*/
type User struct {
	Name string // Field comment
}

// NewUser creates a new User instance
// Parameter name is the user's name
func NewUser(name string) *User {
	return &User{Name: name}
}

// TODO: Implement user validation
func (u *User) Validate() bool {
	// FIXME: This is a placeholder implementation
	return len(u.Name) > 0
}

// NOTE: This method should be optimized
// HACK: Quick fix for performance issue
func (u *User) Process() {
	/* Implementation here */
}

/*
FetchData retrieves data asynchronously

Returns an error when network request fails
*/
func FetchData() error {
	// XXX: Temporary workaround
	// BUG: Known issue with error handling
	return nil
}

// MaxRetries is the maximum number of retry attempts
const MaxRetries = 3
