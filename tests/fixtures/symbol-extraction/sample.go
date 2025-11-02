// Sample Go code for symbol extraction testing
package main

import "fmt"

// Global constant
const APIVersion = "1.0.0"

// Global variable
var globalCounter int = 0

// User struct represents a user
type User struct {
	ID    int
	Name  string
	Email string
}

// Animal interface defines animal behavior
type Animal interface {
	MakeSound() string
	GetName() string
}

// Dog struct implements Animal interface
type Dog struct {
	Name  string
	Breed string
}

// MakeSound returns dog's sound
func (d *Dog) MakeSound() string {
	return "Woof!"
}

// GetName returns dog's name
func (d *Dog) GetName() string {
	return d.Name
}

// GetBreed returns dog's breed
func (d *Dog) GetBreed() string {
	return d.Breed
}

// NewDog creates a new Dog instance
func NewDog(name, breed string) *Dog {
	return &Dog{
		Name:  name,
		Breed: breed,
	}
}

// FetchUser fetches user data by ID
func FetchUser(id int) (*User, error) {
	user := &User{
		ID:   id,
		Name: "John",
	}
	return user, nil
}

// Greet generates a greeting message
func Greet(name string, greeting ...string) string {
	g := "Hello"
	if len(greeting) > 0 {
		g = greeting[0]
	}
	return fmt.Sprintf("%s, %s!", g, name)
}

// Multiply multiplies two numbers
func Multiply(a, b float64) float64 {
	return a * b
}

// main function
func main() {
	dog := NewDog("Buddy", "Golden Retriever")
	fmt.Println(dog.MakeSound())
}
