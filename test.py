import httpx
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

async def test_api():
    api_key = os.getenv("OPENROUTER_API_KEY")
    print(f"API Key exists: {bool(api_key)}")
    print(f"API Key starts with: {api_key[:20] if api_key else 'None'}...")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "google/gemini-2.0-flash-exp:free",
                "messages": [{"role": "user", "content": "Say hello"}]
            }
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")

asyncio.run(test_api())