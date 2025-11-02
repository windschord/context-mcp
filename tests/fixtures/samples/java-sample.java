package com.example;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * User data class
 */
public class User {
    private int id;
    private String name;
    private String email;

    public User(int id, String name, String email) {
        this.id = id;
        this.name = name;
        this.email = email;
    }

    public int getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }
}

/**
 * Repository interface
 */
interface Repository {
    void save(User user);
    Optional<User> findById(int id);
}

/**
 * User manager class
 */
public class UserManager implements Repository {
    private List<User> users;

    public UserManager() {
        this.users = new ArrayList<>();
    }

    public UserManager(List<User> initialUsers) {
        this.users = new ArrayList<>(initialUsers);
    }

    @Override
    public void save(User user) {
        users.add(user);
    }

    public void addUser(User user) {
        users.add(user);
    }

    @Override
    public Optional<User> findById(int id) {
        return users.stream()
                .filter(u -> u.getId() == id)
                .findFirst();
    }

    public Optional<User> getUserById(int id) {
        return findById(id);
    }

    public int getUserCount() {
        return users.size();
    }

    /**
     * Calculate total sum
     */
    public static double calculateTotal(List<Double> items) {
        return items.stream()
                .mapToDouble(Double::doubleValue)
                .sum();
    }
}
