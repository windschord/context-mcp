use std::collections::HashMap;

/// User struct definition
#[derive(Debug, Clone)]
pub struct User {
    pub id: u32,
    pub name: String,
    pub email: Option<String>,
}

/// Repository trait definition
pub trait Repository {
    fn save(&mut self, user: User) -> Result<(), String>;
    fn find_by_id(&self, id: u32) -> Option<&User>;
}

/// UserManager struct
pub struct UserManager {
    users: HashMap<u32, User>,
}

impl UserManager {
    /// Create a new UserManager
    pub fn new() -> Self {
        UserManager {
            users: HashMap::new(),
        }
    }

    /// Add a user
    pub fn add_user(&mut self, user: User) {
        self.users.insert(user.id, user);
    }

    /// Get user by ID
    pub fn get_user_by_id(&self, id: u32) -> Option<&User> {
        self.users.get(&id)
    }

    /// Get user count
    pub fn user_count(&self) -> usize {
        self.users.len()
    }
}

impl Default for UserManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Calculate total
pub fn calculate_total(items: &[f64]) -> f64 {
    items.iter().sum()
}

/// Async function example
pub async fn fetch_user_data(user_id: u32) -> Result<User, String> {
    Ok(User {
        id: user_id,
        name: String::from("Sample User"),
        email: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_manager() {
        let mut manager = UserManager::new();
        assert_eq!(manager.user_count(), 0);
    }
}
