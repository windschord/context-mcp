"""
Utility functions for string and list operations
"""

def reverse_string(s: str) -> str:
    """
    Reverses a string

    Args:
        s: The string to reverse

    Returns:
        The reversed string
    """
    return s[::-1]


def find_max(numbers: list) -> int:
    """
    Finds the maximum number in a list

    Args:
        numbers: List of numbers

    Returns:
        The maximum number in the list

    Raises:
        ValueError: If the list is empty
    """
    if not numbers:
        raise ValueError("List cannot be empty")
    return max(numbers)


class StringProcessor:
    """
    A class for processing strings with various operations
    """

    def __init__(self, text: str):
        """
        Initialize the processor with text

        Args:
            text: The text to process
        """
        self.text = text

    def to_upper(self) -> str:
        """Convert text to uppercase"""
        return self.text.upper()

    def to_lower(self) -> str:
        """Convert text to lowercase"""
        return self.text.lower()

    def word_count(self) -> int:
        """Count the number of words in the text"""
        return len(self.text.split())
