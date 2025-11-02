#include <vector>
#include <string>
#include <optional>
#include <memory>

namespace example {

/**
 * User struct definition
 */
struct User {
    int id;
    std::string name;
    std::optional<std::string> email;

    User(int id, const std::string& name)
        : id(id), name(name), email(std::nullopt) {}

    User(int id, const std::string& name, const std::string& email)
        : id(id), name(name), email(email) {}
};

/**
 * Repository interface
 */
class Repository {
public:
    virtual ~Repository() = default;
    virtual void save(const User& user) = 0;
    virtual std::optional<User> findById(int id) const = 0;
};

/**
 * UserManager class
 */
class UserManager : public Repository {
private:
    std::vector<User> users;

public:
    UserManager() = default;

    explicit UserManager(const std::vector<User>& initialUsers)
        : users(initialUsers) {}

    void save(const User& user) override {
        users.push_back(user);
    }

    void addUser(const User& user) {
        users.push_back(user);
    }

    std::optional<User> findById(int id) const override {
        for (const auto& user : users) {
            if (user.id == id) {
                return user;
            }
        }
        return std::nullopt;
    }

    std::optional<User> getUserById(int id) const {
        return findById(id);
    }

    size_t getUserCount() const {
        return users.size();
    }
};

/**
 * Calculate total sum
 */
double calculateTotal(const std::vector<double>& items) {
    double total = 0.0;
    for (double item : items) {
        total += item;
    }
    return total;
}

// Template function
template<typename T>
T maxValue(T a, T b) {
    return (a > b) ? a : b;
}

} // namespace example
