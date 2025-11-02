// Single line comment before function

/// Doc comment for add function
///
/// # Arguments
/// * `a` - First number
/// * `b` - Second number
///
/// # Returns
/// Sum of a and b
pub fn add(a: i32, b: i32) -> i32 {
    // Inline comment
    a + b // End of line comment
}

/*
 * Multi-line block comment
 * describing the User struct
 */
pub struct User {
    /// Property comment
    pub name: String,
}

impl User {
    /// Constructor comment
    ///
    /// # Arguments
    /// * `name` - User name
    pub fn new(name: String) -> Self {
        User { name }
    }

    // TODO: Implement user validation
    pub fn validate(&self) -> bool {
        // FIXME: This is a placeholder implementation
        !self.name.is_empty()
    }

    // NOTE: This method should be optimized
    // HACK: Quick fix for performance issue
    pub fn process(&self) {
        /* Implementation here */
    }
}

/// Async function with doc comment
///
/// # Errors
/// Returns error when network request fails
pub async fn fetch_data() -> Result<(), Box<dyn std::error::Error>> {
    // XXX: Temporary workaround
    // BUG: Known issue with error handling
    Ok(())
}

/// Maximum retry attempts
pub const MAX_RETRIES: u32 = 3;
