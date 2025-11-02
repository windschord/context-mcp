# Single line comment before function

def add(a: int, b: int) -> int:
    """
    Docstring for add function

    Args:
        a: First number
        b: Second number

    Returns:
        Sum of a and b
    """
    # Inline comment
    return a + b  # End of line comment


class User:
    """
    Multi-line docstring
    describing the User class
    """

    def __init__(self, name: str):
        """
        Constructor docstring

        Args:
            name: User name
        """
        self.name = name

    # TODO: Implement user validation
    def validate(self) -> bool:
        # FIXME: This is a placeholder implementation
        return len(self.name) > 0

    # NOTE: This method should be optimized
    # HACK: Quick fix for performance issue
    def process(self) -> None:
        """Process user data"""
        pass


async def fetch_data() -> None:
    """
    Async function with docstring

    Raises:
        Exception: When network request fails
    """
    # XXX: Temporary workaround
    # BUG: Known issue with error handling
    pass


# Global variable with comment
MAX_RETRIES = 3  # Maximum retry attempts
