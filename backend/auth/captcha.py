import os
import httpx

GENUINE_CAPTCHA_API_URL = os.getenv("GENUINE_CAPTCHA_API_URL", "https://api.genuine-captcha.io")

async def verify_captcha(solution: str, secret: str) -> bool:
    """Verify CAPTCHA solution with Genuine CAPTCHA API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GENUINE_CAPTCHA_API_URL}/verify",
                json={
                    "solution": solution,
                    "secret": secret
                }
            )
            data = response.json()
            return data.get("verified", False)
    except Exception as e:
        print(f"❌ CAPTCHA verification error: {e}")
        return False
