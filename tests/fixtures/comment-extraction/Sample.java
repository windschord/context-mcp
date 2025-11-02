// Single line comment before class

/**
 * JavaDoc comment for User class
 * This class represents a user
 */
public class Sample {
    /** Field comment */
    private String name;

    /**
     * Constructor comment
     * @param name User name
     */
    public Sample(String name) {
        this.name = name;
    }

    /**
     * Add two numbers
     * @param a First number
     * @param b Second number
     * @return Sum of a and b
     */
    public static int add(int a, int b) {
        // Inline comment
        return a + b; // End of line comment
    }

    // TODO: Implement user validation
    public boolean validate() {
        // FIXME: This is a placeholder implementation
        return this.name != null && this.name.length() > 0;
    }

    // NOTE: This method should be optimized
    // HACK: Quick fix for performance issue
    public void process() {
        /* Implementation here */
    }

    /**
     * Fetch data asynchronously
     * @throws Exception When network request fails
     */
    public void fetchData() throws Exception {
        // XXX: Temporary workaround
        // BUG: Known issue with error handling
    }

    /*
     * Multi-line block comment
     * for constant
     */
    public static final int MAX_RETRIES = 3;
}
