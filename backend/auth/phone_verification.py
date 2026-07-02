import os
from twilio.rest import Client

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")

client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) if TWILIO_ACCOUNT_SID else None

def send_sms_otp(phone: str, otp: str):
    """Send OTP via SMS using Twilio"""
    if not client:
        print("⚠️ Twilio not configured. SMS not sent.")
        return

    try:
        message = client.messages.create(
            body=f"🧠 Cortexa AI - Your verification code is: {otp}. This code expires in 10 minutes.",
            from_=TWILIO_PHONE_NUMBER,
            to=phone
        )
        print(f"📱 SMS OTP sent to {phone}: {message.sid}")
    except Exception as e:
        print(f"❌ SMS send error: {e}")
