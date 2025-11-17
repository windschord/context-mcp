/// Text tokenization and normalization for BM25 search
///
/// This module provides code-aware tokenization that handles:
/// - camelCase and PascalCase splitting
/// - snake_case splitting
/// - Whitespace and punctuation tokenization
/// - Lowercase normalization
/// - Special handling for code symbols

use regex::Regex;
use std::sync::OnceLock;

/// Tokenizer for converting text into searchable terms
#[derive(Debug, Clone)]
pub struct Tokenizer {
    /// Whether to convert terms to lowercase (default: true)
    lowercase: bool,

    /// Whether to split camelCase/PascalCase (default: true for code)
    split_camel_case: bool,

    /// Whether to split snake_case (default: true for code)
    split_snake_case: bool,

    /// Minimum term length (default: 1)
    min_term_length: usize,

    /// Maximum term length (default: 100)
    max_term_length: usize,
}

impl Default for Tokenizer {
    fn default() -> Self {
        Self {
            lowercase: true,
            split_camel_case: true,
            split_snake_case: true,
            min_term_length: 1,
            max_term_length: 100,
        }
    }
}

impl Tokenizer {
    /// Create a new tokenizer with default settings
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a tokenizer optimized for code
    pub fn code() -> Self {
        Self {
            lowercase: true,
            split_camel_case: true,
            split_snake_case: true,
            min_term_length: 2, // Ignore single-letter vars in code
            max_term_length: 100,
        }
    }

    /// Create a tokenizer optimized for natural language text
    pub fn text() -> Self {
        Self {
            lowercase: true,
            split_camel_case: false,
            split_snake_case: false,
            min_term_length: 3,
            max_term_length: 50,
        }
    }

    /// Set whether to convert to lowercase
    pub fn with_lowercase(mut self, lowercase: bool) -> Self {
        self.lowercase = lowercase;
        self
    }

    /// Set whether to split camelCase
    pub fn with_split_camel_case(mut self, split: bool) -> Self {
        self.split_camel_case = split;
        self
    }

    /// Set whether to split snake_case
    pub fn with_split_snake_case(mut self, split: bool) -> Self {
        self.split_snake_case = split;
        self
    }

    /// Set minimum term length
    pub fn with_min_term_length(mut self, length: usize) -> Self {
        self.min_term_length = length;
        self
    }

    /// Tokenize text into a list of terms
    ///
    /// # Arguments
    /// * `text` - The text to tokenize
    ///
    /// # Returns
    /// A vector of normalized terms
    pub fn tokenize(&self, text: &str) -> Vec<String> {
        let mut terms = Vec::new();

        // First split on whitespace and punctuation (except _ which we handle separately)
        let word_regex = get_word_regex();
        for word_match in word_regex.find_iter(text) {
            let word = word_match.as_str();

            // Apply splitting strategies
            let mut word_terms = vec![word.to_string()];

            // Split camelCase and PascalCase
            if self.split_camel_case {
                word_terms = word_terms
                    .into_iter()
                    .flat_map(|w| split_camel_case(&w))
                    .collect();
            }

            // Split snake_case
            if self.split_snake_case {
                word_terms = word_terms
                    .into_iter()
                    .flat_map(|w| split_snake_case(&w))
                    .collect();
            }

            // Normalize and filter
            for term in word_terms {
                if let Some(normalized) = self.normalize(&term) {
                    terms.push(normalized);
                }
            }
        }

        terms
    }

    /// Normalize a single term
    ///
    /// Returns None if the term should be filtered out
    fn normalize(&self, term: &str) -> Option<String> {
        let mut normalized = term.to_string();

        // Convert to lowercase
        if self.lowercase {
            normalized = normalized.to_lowercase();
        }

        // Check length constraints
        if normalized.len() < self.min_term_length || normalized.len() > self.max_term_length {
            return None;
        }

        // Filter out pure punctuation
        if normalized.chars().all(|c| !c.is_alphanumeric()) {
            return None;
        }

        Some(normalized)
    }

    /// Get the unique set of terms from text (for vocabulary building)
    pub fn get_unique_terms(&self, text: &str) -> Vec<String> {
        let mut terms: Vec<_> = self.tokenize(text);
        terms.sort();
        terms.dedup();
        terms
    }
}

/// Split camelCase and PascalCase into separate words
///
/// Examples:
/// - "camelCase" -> ["camel", "Case"]
/// - "HTTPServer" -> ["HTTP", "Server"]
/// - "getHTTPResponseCode" -> ["get", "HTTP", "Response", "Code"]
fn split_camel_case(word: &str) -> Vec<String> {
    if word.is_empty() {
        return vec![];
    }

    let chars: Vec<char> = word.chars().collect();
    let mut results = Vec::new();
    let mut current = String::new();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];

        if ch.is_uppercase() {
            // Check if we have accumulated lowercase/digit chars
            if !current.is_empty() && (current.chars().last().unwrap().is_lowercase() || current.chars().last().unwrap().is_ascii_digit()) {
                results.push(current.clone());
                current.clear();
            }

            // Collect consecutive uppercase letters
            current.push(ch);
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_uppercase() {
                current.push(chars[j]);
                j += 1;
            }

            // If next char is lowercase, keep the last uppercase with it
            if j < chars.len() && chars[j].is_lowercase() && current.len() > 1 {
                let last_upper = current.pop().unwrap();
                results.push(current.clone());
                current.clear();
                current.push(last_upper);
            }

            i = j;
        } else if ch.is_lowercase() {
            current.push(ch);
            i += 1;
        } else if ch.is_ascii_digit() {
            // Numbers can continue current word or start new one
            if !current.is_empty() && current.chars().last().unwrap().is_uppercase() {
                // If current is all uppercase, keep the number separate
                if current.chars().all(|c| c.is_uppercase()) && current.len() > 1 {
                    results.push(current.clone());
                    current.clear();
                }
            }
            current.push(ch);
            i += 1;
        } else {
            // Other characters end the current word
            if !current.is_empty() {
                results.push(current.clone());
                current.clear();
            }
            i += 1;
        }
    }

    if !current.is_empty() {
        results.push(current);
    }

    if results.is_empty() {
        vec![word.to_string()]
    } else {
        results
    }
}

/// Split snake_case into separate words
///
/// Examples:
/// - "snake_case" -> ["snake", "case"]
/// - "HTTP_SERVER" -> ["HTTP", "SERVER"]
/// - "__private" -> ["private"]
fn split_snake_case(word: &str) -> Vec<String> {
    word.split('_')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

// Cached regex patterns for performance
static WORD_REGEX: OnceLock<Regex> = OnceLock::new();

fn get_word_regex() -> &'static Regex {
    WORD_REGEX.get_or_init(|| {
        // Match sequences of alphanumeric characters and underscores
        Regex::new(r"[a-zA-Z0-9_]+").unwrap()
    })
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_tokenization() {
        let tokenizer = Tokenizer::new();
        let tokens = tokenizer.tokenize("Hello world! This is a test.");

        assert_eq!(
            tokens,
            vec!["hello", "world", "this", "is", "a", "test"]
        );
    }

    #[test]
    fn test_camel_case_splitting() {
        let tokenizer = Tokenizer::code();
        let tokens = tokenizer.tokenize("getUserById");

        assert!(tokens.contains(&"get".to_string()));
        assert!(tokens.contains(&"user".to_string()));
        assert!(tokens.contains(&"by".to_string()));
        assert!(tokens.contains(&"id".to_string()));
    }

    #[test]
    fn test_snake_case_splitting() {
        let tokenizer = Tokenizer::code();
        let tokens = tokenizer.tokenize("get_user_by_id");

        assert!(tokens.contains(&"get".to_string()));
        assert!(tokens.contains(&"user".to_string()));
        assert!(tokens.contains(&"by".to_string()));
        assert!(tokens.contains(&"id".to_string()));
    }

    #[test]
    fn test_pascal_case_splitting() {
        let tokenizer = Tokenizer::code();
        let tokens = tokenizer.tokenize("HTTPServer");

        assert!(tokens.contains(&"http".to_string()));
        assert!(tokens.contains(&"server".to_string()));
    }

    #[test]
    fn test_complex_code_tokenization() {
        let tokenizer = Tokenizer::code();
        let tokens = tokenizer.tokenize("pub fn parseHTTPRequest(request_data: &str)");

        assert!(tokens.contains(&"pub".to_string()));
        assert!(tokens.contains(&"fn".to_string()));
        assert!(tokens.contains(&"parse".to_string()));
        assert!(tokens.contains(&"http".to_string()));
        assert!(tokens.contains(&"request".to_string()));
        assert!(tokens.contains(&"data".to_string()));
        assert!(tokens.contains(&"str".to_string()));
    }

    #[test]
    fn test_min_term_length() {
        let tokenizer = Tokenizer::new().with_min_term_length(3);
        let tokens = tokenizer.tokenize("a ab abc abcd");

        assert!(!tokens.contains(&"a".to_string()));
        assert!(!tokens.contains(&"ab".to_string()));
        assert!(tokens.contains(&"abc".to_string()));
        assert!(tokens.contains(&"abcd".to_string()));
    }

    #[test]
    fn test_lowercase_normalization() {
        let tokenizer = Tokenizer::new().with_lowercase(true);
        let tokens = tokenizer.tokenize("HELLO World");

        assert_eq!(tokens, vec!["hello", "world"]);
    }

    #[test]
    fn test_no_lowercase() {
        let tokenizer = Tokenizer::new().with_lowercase(false);
        let tokens = tokenizer.tokenize("HELLO World");

        assert!(tokens.contains(&"HELLO".to_string()));
        assert!(tokens.contains(&"World".to_string()));
    }

    #[test]
    fn test_split_camel_case_function() {
        assert_eq!(
            split_camel_case("camelCase"),
            vec!["camel", "Case"]
        );
        assert_eq!(
            split_camel_case("HTTPServer"),
            vec!["HTTP", "Server"]
        );
        assert_eq!(
            split_camel_case("getHTTPResponseCode"),
            vec!["get", "HTTP", "Response", "Code"]
        );
        assert_eq!(
            split_camel_case("lowercase"),
            vec!["lowercase"]
        );
    }

    #[test]
    fn test_split_snake_case_function() {
        assert_eq!(
            split_snake_case("snake_case"),
            vec!["snake", "case"]
        );
        assert_eq!(
            split_snake_case("HTTP_SERVER"),
            vec!["HTTP", "SERVER"]
        );
        assert_eq!(
            split_snake_case("__private"),
            vec!["private"]
        );
        assert_eq!(
            split_snake_case("no_underscores_here"),
            vec!["no", "underscores", "here"]
        );
    }

    #[test]
    fn test_unique_terms() {
        let tokenizer = Tokenizer::new();
        let unique = tokenizer.get_unique_terms("hello world hello again world");

        assert_eq!(unique, vec!["again", "hello", "world"]);
    }

    #[test]
    fn test_text_vs_code_tokenizer() {
        let text_tokenizer = Tokenizer::text();
        let code_tokenizer = Tokenizer::code();

        let text = "getUserById";

        let text_tokens = text_tokenizer.tokenize(text);
        let code_tokens = code_tokenizer.tokenize(text);

        // Text tokenizer should not split camelCase
        assert_eq!(text_tokens.len(), 1);

        // Code tokenizer should split camelCase
        assert!(code_tokens.len() > 1);
    }

    #[test]
    fn test_empty_string() {
        let tokenizer = Tokenizer::new();
        let tokens = tokenizer.tokenize("");
        assert!(tokens.is_empty());
    }

    #[test]
    fn test_special_characters() {
        let tokenizer = Tokenizer::new();
        let tokens = tokenizer.tokenize("hello!@#$%world");
        assert_eq!(tokens, vec!["hello", "world"]);
    }

    #[test]
    fn test_numbers() {
        let tokenizer = Tokenizer::new();
        let tokens = tokenizer.tokenize("test123 abc456def");
        assert!(tokens.contains(&"test123".to_string()));
        assert!(tokens.contains(&"abc456def".to_string()));
    }
}
