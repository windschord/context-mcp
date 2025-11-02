#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/**
 * User struct definition
 */
typedef struct {
    int id;
    char name[100];
    char email[100];
} User;

/**
 * UserManager struct
 */
typedef struct {
    User* users;
    int count;
    int capacity;
} UserManager;

/**
 * Create a new UserManager
 */
UserManager* createUserManager(int initialCapacity) {
    UserManager* manager = (UserManager*)malloc(sizeof(UserManager));
    if (manager == NULL) {
        return NULL;
    }

    manager->users = (User*)malloc(sizeof(User) * initialCapacity);
    if (manager->users == NULL) {
        free(manager);
        return NULL;
    }

    manager->count = 0;
    manager->capacity = initialCapacity;
    return manager;
}

/**
 * Add a user
 */
int addUser(UserManager* manager, User user) {
    if (manager == NULL) {
        return -1;
    }

    if (manager->count >= manager->capacity) {
        int newCapacity = manager->capacity * 2;
        User* newUsers = (User*)realloc(manager->users, sizeof(User) * newCapacity);
        if (newUsers == NULL) {
            return -1;
        }
        manager->users = newUsers;
        manager->capacity = newCapacity;
    }

    manager->users[manager->count] = user;
    manager->count++;
    return 0;
}

/**
 * Get user by ID
 */
User* getUserById(UserManager* manager, int id) {
    if (manager == NULL) {
        return NULL;
    }

    for (int i = 0; i < manager->count; i++) {
        if (manager->users[i].id == id) {
            return &manager->users[i];
        }
    }
    return NULL;
}

/**
 * Get user count
 */
int getUserCount(UserManager* manager) {
    if (manager == NULL) {
        return -1;
    }
    return manager->count;
}

/**
 * Calculate total sum
 */
double calculateTotal(double* items, int count) {
    double total = 0.0;
    for (int i = 0; i < count; i++) {
        total += items[i];
    }
    return total;
}

/**
 * Free UserManager
 */
void freeUserManager(UserManager* manager) {
    if (manager != NULL) {
        free(manager->users);
        free(manager);
    }
}
