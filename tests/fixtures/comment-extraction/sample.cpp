// Single line comment before function

/**
 * @brief Add two numbers
 * @param a First number
 * @param b Second number
 * @return Sum of a and b
 */
int add(int a, int b) {
    // Inline comment
    return a + b; // End of line comment
}

/*
 * Multi-line block comment
 * describing the User class
 */
class User {
public:
    /** Property comment */
    std::string name;

    /**
     * @brief Constructor comment
     * @param name User name
     */
    User(const std::string& name) : name(name) {}

    // TODO: Implement user validation
    bool validate() {
        // FIXME: This is a placeholder implementation
        return !name.empty();
    }

    // NOTE: This method should be optimized
    // HACK: Quick fix for performance issue
    void process() {
        /* Implementation here */
    }
};

/**
 * @brief Fetch data
 * @throws std::runtime_error When network request fails
 */
void fetchData() {
    // XXX: Temporary workaround
    // BUG: Known issue with error handling
}

/// Maximum retry attempts
const int MAX_RETRIES = 3;
