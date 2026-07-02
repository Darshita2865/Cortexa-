"""
Authentication Module for Cortexa
Handles user registration, verification, and session management
"""

from .database import db, get_user_from_token, generate_otp, hash_password, verify_password
from .email_verification import send_verification_email, generate_verification_token
from .phone_verification import send_sms_otp

__all__ = [
    'db',
    'get_user_from_token',
    'generate_otp',
    'hash_password',
    'verify_password',
    'send_verification_email',
    'generate_verification_token',
    'send_sms_otp'
]
