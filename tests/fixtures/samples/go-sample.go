package main

import (
	"fmt"
	"sync"
)

// User struct definition
type User struct {
	ID    int
	Name  string
	Email string
}

// Repository interface definition
type Repository interface {
	Save(user User) error
	FindByID(id int) (*User, error)
}

// UserManager struct
type UserManager struct {
	users []User
	mu    sync.RWMutex
}

// NewUserManager constructor
func NewUserManager(initialUsers []User) *UserManager {
	return &UserManager{
		users: initialUsers,
	}
}

// AddUser method
func (m *UserManager) AddUser(user User) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.users = append(m.users, user)
}

// GetUserByID method
func (m *UserManager) GetUserByID(id int) *User {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, user := range m.users {
		if user.ID == id {
			return &user
		}
	}
	return nil
}

// UserCount method
func (m *UserManager) UserCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.users)
}

// CalculateTotal function
func CalculateTotal(items []float64) float64 {
	total := 0.0
	for _, item := range items {
		total += item
	}
	return total
}

func main() {
	manager := NewUserManager([]User{})
	manager.AddUser(User{ID: 1, Name: "Alice", Email: "alice@example.com"})
	fmt.Printf("Total users: %d\n", manager.UserCount())
}
