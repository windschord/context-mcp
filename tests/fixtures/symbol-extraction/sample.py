"""
Sample Python code for symbol extraction testing
"""

# Global constant
API_VERSION = '1.0.0'

# Global variable
global_counter = 0


class Animal:
    """Base class for animals"""

    def __init__(self, name: str):
        """Initialize animal with name"""
        self.name = name

    def make_sound(self) -> str:
        """Make animal sound (abstract method)"""
        raise NotImplementedError("Subclass must implement make_sound")

    def get_name(self) -> str:
        """Get animal name"""
        return self.name


class Dog(Animal):
    """Dog class extending Animal"""

    def __init__(self, name: str, breed: str):
        """Initialize dog with name and breed"""
        super().__init__(name)
        self.breed = breed

    def make_sound(self) -> str:
        """Dog barks"""
        return "Woof!"

    def get_breed(self) -> str:
        """Get dog breed"""
        return self.breed


async def fetch_user(user_id: int) -> dict:
    """
    Async function to fetch user data

    Args:
        user_id: The ID of the user

    Returns:
        User data as dictionary
    """
    # Simulated async operation
    return {"id": user_id, "name": "John"}


def greet(name: str, greeting: str = "Hello") -> str:
    """
    Greet someone with optional custom greeting

    Args:
        name: Person's name
        greeting: Greeting message (default: "Hello")

    Returns:
        Formatted greeting string
    """
    return f"{greeting}, {name}!"


def multiply(a: float, b: float) -> float:
    """Multiply two numbers"""
    return a * b


# Lambda function
square = lambda x: x * x

# List comprehension with variable
numbers = [i for i in range(10)]
