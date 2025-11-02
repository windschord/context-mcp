"""
Python sample code for AST parsing tests
"""

from typing import List, Optional
from dataclasses import dataclass


# Dataclass definition
@dataclass
class User:
    """User data class"""
    id: int
    name: str
    email: Optional[str] = None


# Class definition with decorator
class UserManager:
    """User management class"""

    def __init__(self, initial_users: List[User] = None):
        self.users: List[User] = initial_users or []

    def add_user(self, user: User) -> None:
        """Add a user to the list"""
        self.users.append(user)

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID"""
        for user in self.users:
            if user.id == user_id:
                return user
        return None

    @property
    def user_count(self) -> int:
        """Get total user count"""
        return len(self.users)


# Function definition
def calculate_total(items: List[float]) -> float:
    """Calculate total sum of items"""
    return sum(items)


# Async function
async def fetch_user_data(user_id: int) -> User:
    """Fetch user data asynchronously"""
    # Simulated async operation
    return User(id=user_id, name="Sample User")
