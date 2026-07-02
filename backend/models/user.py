from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., pattern=r'^\+?[1-9]\d{1,14}$')  # E.164 format
    password: str = Field(..., min_length=8)

class UserVerifyEmail(BaseModel):
    email: str
    code: str

class UserVerifyPhone(BaseModel):
    phone: str
    code: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserInDB(BaseModel):
    id: str
    full_name: str
    email: str
    phone: str
    email_verified: bool = False
    phone_verified: bool = False
    created_at: datetime
    updated_at: datetime
