import os
import random
import string
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from datetime import datetime, timedelta
import jwt

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key")
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")

def generate_verification_token(email: str) -> str:
    """Generate JWT token for email verification"""
    payload = {
        "email": email,
        "exp": datetime.utcnow() + timedelta(hours=24)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def generate_otp() -> str:
    """Generate 6-digit OTP"""
    return ''.join(random.choices(string.digits, k=6))

def send_verification_email(email: str, token: str):
    """Send verification email using SendGrid"""
    if not SENDGRID_API_KEY:
        print("⚠️ SENDGRID_API_KEY not set. Email not sent.")
        return

    verification_url = f"https://YOUR_SPACE_URL/verify-email?token={token}"
    
    message = Mail(
        from_email='noreply@cortexa.ai',
        to_emails=email,
        subject='Verify Your Email - Cortexa AI',
        html_content=f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 10px;">
            <h1 style="color: #667eea;">🧠 Cortexa AI</h1>
            <p>Hi there!</p>
            <p>Thanks for signing up for Cortexa AI. Please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{verification_url}" style="background: linear-gradient(90deg, #667eea, #764ba2); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold;">Verify Email</a>
            </div>
            <p>Or copy this link into your browser:</p>
            <p style="background: #e9ecef; padding: 10px; border-radius: 5px; word-break: break-all;">{verification_url}</p>
            <p style="color: #6c757d; font-size: 12px;">This link expires in 24 hours.</p>
            <hr style="border: none; border-top: 1px solid #dee2e6;">
            <p style="color: #6c757d; font-size: 12px;">© 2026 Cortexa AI. All rights reserved.</p>
        </div>
        """
    )

    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        print(f"📧 Verification email sent to {email}: {response.status_code}")
    except Exception as e:
        print(f"❌ Email send error: {e}")
