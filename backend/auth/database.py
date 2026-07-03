"""
Database Module for Cortexa
Handles user storage, verification, and session management
"""

import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import json
from passlib.context import CryptContext
import jwt
from dotenv import load_dotenv

load_dotenv()
# CONFIGURATION
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-super-secret-key-change-this")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# USER STORE 
class UserDatabase:
    """In-memory user store for MVP. Replace with real DB for production."""
    
    def __init__(self):
        self.users = {}  # email -> user_data
        self.pending_verifications = {}  # email -> {otp, created_at}
        self.sessions = {}  # token -> user_data
        
    # ========== USER CRUD ==========
    
    def create_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new user"""
        user_id = str(uuid.uuid4())
        
        user = {
            "id": user_id,
            "email": user_data["email"],
            "full_name": user_data["full_name"],
            "phone": user_data["phone"],
            "password_hash": pwd_context.hash(user_data["password"]),
            "email_verified": False,
            "phone_verified": False,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "is_active": True,
            "last_login": None
        }
        
        self.users[user_data["email"]] = user
        return user
    
    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email"""
        return self.users.get(email)
    
    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user by ID"""
        for user in self.users.values():
            if user["id"] == user_id:
                return user
        return None
    
    def update_user(self, email: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update user data"""
        user = self.users.get(email)
        if not user:
            return None
        
        for key, value in updates.items():
            if key in user:
                user[key] = value
        
        user["updated_at"] = datetime.utcnow().isoformat()
        return user
    
    def delete_user(self, email: str) -> bool:
        """Delete a user"""
        if email in self.users:
            del self.users[email]
            return True
        return False
    
    # ========== VERIFICATION ==========
    
    def store_verification_otp(self, email: str, otp: str) -> None:
        """Store OTP for verification"""
        self.pending_verifications[email] = {
            "otp": otp,
            "created_at": datetime.utcnow()
        }
    
    def verify_otp(self, email: str, otp: str) -> bool:
        """Verify OTP and mark user as verified"""
        pending = self.pending_verifications.get(email)
        if not pending:
            return False
        
        # Check if OTP matches
        if pending["otp"] != otp:
            return False
        
        # Check if OTP is expired (10 minutes)
        if datetime.utcnow() - pending["created_at"] > timedelta(minutes=10):
            return False
        
        # Mark user as verified
        user = self.users.get(email)
        if user:
            user["email_verified"] = True
        
        # Remove used OTP
        del self.pending_verifications[email]
        return True
    
    def verify_phone_otp(self, phone: str, otp: str) -> bool:
        """Verify phone OTP"""
        # Find user by phone
        for user in self.users.values():
            if user["phone"] == phone:
                # Store phone verification separately
                # For MVP, we'll use the same pending store
                pending = self.pending_verifications.get(phone)
                if not pending:
                    return False
                
                if pending["otp"] != otp:
                    return False
                
                if datetime.utcnow() - pending["created_at"] > timedelta(minutes=10):
                    return False
                
                user["phone_verified"] = True
                del self.pending_verifications[phone]
                return True
        
        return False
    
    # ========== AUTHENTICATION ==========
    
    def authenticate_user(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        """Authenticate user with email and password"""
        user = self.users.get(email)
        if not user:
            return None
        
        if not pwd_context.verify(password, user["password_hash"]):
            return None
        
        if not user["email_verified"]:
            return None
        
        if not user["phone_verified"]:
            return None
        
        # Update last login
        user["last_login"] = datetime.utcnow().isoformat()
        
        return user
    
    def create_session(self, user: Dict[str, Any]) -> str:
        """Create JWT session token"""
        payload = {
            "sub": user["email"],
            "user_id": user["id"],
            "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
        }
        token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
        self.sessions[token] = user["email"]
        return token
    
    def verify_session(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify JWT session token"""
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            email = payload.get("sub")
            if email in self.sessions.values():
                return self.users.get(email)
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
        return None
    
    def logout(self, token: str) -> bool:
        """Invalidate session token"""
        if token in self.sessions:
            del self.sessions[token]
            return True
        return False
    
    # ========== UTILITY ==========
    
    def get_all_users(self) -> list:
        """Get all users (admin only)"""
        return list(self.users.values())
    
    def get_stats(self) -> Dict[str, Any]:
        """Get database statistics"""
        verified = sum(1 for u in self.users.values() if u["email_verified"])
        phone_verified = sum(1 for u in self.users.values() if u["phone_verified"])
        return {
            "total_users": len(self.users),
            "email_verified": verified,
            "phone_verified": phone_verified,
            "pending_verifications": len(self.pending_verifications),
            "active_sessions": len(self.sessions)
        }
# SINGLETON INSTANCE
db = UserDatabase()

# HELPER FUNCTIONS
def get_user_from_token(token: str) -> Optional[Dict[str, Any]]:
    """Get user from JWT token"""
    return db.verify_session(token)

def generate_verification_token(email: str) -> str:
    """Generate JWT token for email verification"""
    payload = {
        "email": email,
        "type": "email_verification",
        "exp": datetime.utcnow() + timedelta(hours=24)
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def generate_otp() -> str:
    """Generate a 6-digit OTP"""
    import random
    import string
    return ''.join(random.choices(string.digits, k=6))

def hash_password(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)
