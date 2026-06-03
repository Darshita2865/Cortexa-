from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import hashlib
import uuid
import uvicorn
from typing import Optional
from groq import Groq
from dotenv import load_dotenv
import requests
import re
from typing import Optional

app = FastAPI()


# ================= LOAD ENVIRONMENT VARIABLES =================//
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

if not GROQ_API_KEY:
    print("=" * 50)
    print("❌ ERROR: GROQ_API_KEY not found in environment variables!")
    print("Please set GROQ_API_KEY environment variable in Render dashboard")
    print("Get free key from: https://console.groq.com")
    print("=" * 50)
    client = None
else:
    client = Groq(api_key=GROQ_API_KEY)
    print("=" * 50)
    print("✅ Groq API key loaded successfully!")
    print("🔒 API key is secure and hidden from code")
    print("=" * 50)


# ================= CORS =================//
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================= MODELS =================//
class Message(BaseModel):
    message: str
    document_content: Optional[str] = None
    audio: bool = False

# ================= AVAILABLE MODELS =================//
MODELS = {
    "fast": "llama-3.1-8b-instant",
    "balanced": "llama-3.3-70b-versatile",
    "powerful": "mixtral-8x7b-32768",
    "coding": "deepseek-r1-distill-llama-70b"
}

PREFERRED_MODEL = MODELS["balanced"]

# ================= SYSTEM PROMPT =================//
SYSTEM_PROMPT = """You are Cortexa, a powerful AI assistant. 

IMPORTANT RULES:
1. NEVER give generic responses like "Got it! Let me help you with that"
2. ALWAYS answer the user's question directly with SPECIFIC information
3. Be conversational, friendly, and helpful
4. Use **bold** for emphasis and bullet points for lists
5. Keep responses informative but not overly long

Never respond with generic phrases. Always provide specific, helpful answers."""

# ================= HELPER FUNCTION =================//
def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from URL"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=)([\w-]+)',
        r'(?:youtu\.be\/)([\w-]+)',
        r'(?:youtube\.com\/embed\/)([\w-]+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

# ================= AI RESPONSE FUNCTION =================//
async def get_ai_response(message: str, context: Optional[str] = None) -> str:
    """Get intelligent response from Groq API"""
    
    if not client:
        print("❌ No Groq client available")
        return "⚠️ API key not configured. Please check your .env file."
    
    try:
        print(f"🤖 Calling Groq API with model: {PREFERRED_MODEL}")
        print(f"📝 User message: {message[:100]}...")
        
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        
        if context and context != "null" and len(context) > 10:
            messages.append({
                "role": "system",
                "content": f"Reference document: {context[:1000]}"
            })
        
        messages.append({"role": "user", "content": message})
        
        completion = client.chat.completions.create(
            model=PREFERRED_MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=1024,
            top_p=1,
            stream=False
        )
        
        response = completion.choices[0].message.content
        print(f"✅ Groq response received: {len(response)} chars")
        return response
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Groq API Error: {error_msg}")
        
        if "decommissioned" in error_msg or "not found" in error_msg:
            print("🔄 Trying fallback model...")
            try:
                fallback_model = MODELS["fast"]
                messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": message}
                ]
                
                completion = client.chat.completions.create(
                    model=fallback_model,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=1024
                )
                
                return completion.choices[0].message.content
            except Exception as fallback_error:
                print(f"❌ Fallback failed: {fallback_error}")
                return f"⚠️ Error: {error_msg[:200]}"
        
        return f"⚠️ Error: {error_msg[:200]}"

# ================= CHAT ENDPOINT =================//
@app.post("/chat")
async def chat(data: Message):
    try:
        user_msg = data.message.strip()
        print(f"\n📥 Received: {user_msg}")
        
        if not user_msg:
            return {"response": "Please enter a message! 💙"}
        
        reply = await get_ai_response(user_msg, data.document_content)
        print(f"✅ Response sent\n")
        
        return {"role": "assistant", "response": reply}
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return {"response": f"Error: {str(e)}. Please try again."}

# ================= YOUTUBE ENDPOINTS =================//

@app.get("/youtube-search")
async def youtube_search(query: str, max_results: int = 10):
    """Search YouTube videos"""
    if not YOUTUBE_API_KEY:
        return {"error": "YouTube API key not configured. Add YOUTUBE_API_KEY to .env file"}
    
    try:
        url = "https://www.googleapis.com/youtube/v3/search"
        params = {
            "part": "snippet",
            "q": query,
            "maxResults": max_results,
            "type": "video",
            "key": YOUTUBE_API_KEY
        }
        
        response = requests.get(url, params=params)
        data = response.json()
        
        if "error" in data:
            return {"error": data["error"]["message"]}
        
        videos = []
        for item in data.get("items", []):
            videos.append({
                "id": item["id"]["videoId"],
                "title": item["snippet"]["title"],
                "description": item["snippet"]["description"],
                "thumbnail": item["snippet"]["thumbnails"]["medium"]["url"],
                "channel": item["snippet"]["channelTitle"]
            })
        
        return {"videos": videos}
        
    except Exception as e:
        return {"error": str(e)}

@app.get("/youtube-video-info")
async def youtube_video_info(video_id: str):
    """Get detailed info about a YouTube video"""
    if not YOUTUBE_API_KEY:
        return {"error": "YouTube API key not configured"}
    
    try:
        url = "https://www.googleapis.com/youtube/v3/videos"
        params = {
            "part": "snippet,contentDetails,statistics",
            "id": video_id,
            "key": YOUTUBE_API_KEY
        }
        
        response = requests.get(url, params=params)
        data = response.json()
        
        if "error" in data:
            return {"error": data["error"]["message"]}
        
        if data.get("items"):
            item = data["items"][0]
            return {
                "title": item["snippet"]["title"],
                "description": item["snippet"]["description"],
                "duration": item["contentDetails"]["duration"],
                "views": item["statistics"].get("viewCount", 0),
                "likes": item["statistics"].get("likeCount", 0)
            }
        
        return {"error": "Video not found"}
        
    except Exception as e:
        return {"error": str(e)}

@app.post("/youtube-summary")
async def youtube_summary(data: dict):
    """Generate AI summary of YouTube video using Groq"""
    video_url = data.get("url", "")
    video_id = extract_video_id(video_url)
    
    if not video_id:
        return {"error": "Invalid YouTube URL"}
    
    info = await youtube_video_info(video_id)
    if "error" in info:
        return info
    
    if not client:
        return {"error": "Groq API not configured"}
    
    try:
        messages = [
            {"role": "system", "content": "You are a helpful assistant that summarizes YouTube videos based on their title and description."},
            {"role": "user", "content": f"Create a detailed summary and learning points for this video:\nTitle: {info['title']}\nDescription: {info['description'][:500]}"}
        ]
        
        completion = client.chat.completions.create(
            model=PREFERRED_MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=500
        )
        
        return {
            "summary": completion.choices[0].message.content,
            "title": info['title'],
            "video_id": video_id
        }
        
    except Exception as e:
        return {"error": str(e)}

# ================= DOCUMENT UPLOAD =================//
@app.post("/upload-document")
async def upload_document(file: UploadFile = File(...)):
    try:
        content = ""
        filename = file.filename
        
        if filename.lower().endswith(".txt"):
            content = (await file.read()).decode("utf-8")
            print(f"📄 Document uploaded: {filename} ({len(content)} chars)")
        else:
            try:
                content = (await file.read()).decode("utf-8")
                print(f"📄 File uploaded: {filename} ({len(content)} chars)")
            except:
                content = f"File uploaded: {filename} (binary file)"
                print(f"📄 Binary file uploaded: {filename}")
        
        return {
            "filename": filename,
            "content": content[:2000],
            "status": "success"
        }
        
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

# ================= AUDIO GENERATION =================//
@app.post("/generate-audio")
async def generate_audio(data: dict):
    try:
        text = data.get("text", "")
        if not text:
            return JSONResponse(status_code=400, content={"error": "No text"})
        
        os.makedirs("audio_files", exist_ok=True)
        filename = f"audio_{uuid.uuid4().hex[:8]}.mp3"
        
        try:
            from gtts import gTTS
            tts = gTTS(text=text, lang='en', slow=False)
            filepath = os.path.join("audio_files", filename)
            tts.save(filepath)
            print(f"🎵 Audio generated: {filename}")
            return {"audio_url": f"/audio/{filename}"}
        except ImportError:
            return {"audio_url": None, "message": "pip install gtts for audio"}
        except Exception as e:
            print(f"❌ TTS error: {e}")
            return {"audio_url": None, "message": f"Audio error: {str(e)}"}
        
    except Exception as e:
        print(f"❌ Audio error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/audio/{filename}")
async def get_audio(filename: str):
    filepath = os.path.join("audio_files", filename)
    if not os.path.exists(filepath):
        return JSONResponse(status_code=404, content={"error": "Not found"})
    return FileResponse(filepath, media_type="audio/mpeg")

# ================= HEALTH CHECK =================//
@app.get("/health")
async def health():
    groq_status = "not_configured"
    
    if client:
        try:
            test = client.chat.completions.create(
                model=MODELS["fast"],
                messages=[{"role": "user", "content": "test"}],
                max_tokens=5
            )
            groq_status = "connected"
        except Exception as e:
            groq_status = f"error: {str(e)[:50]}"
    
    return {
        "status": "running",
        "message": "✅ Cortexa Backend with Groq AI",
        "groq_api": groq_status,
        "youtube_api": "configured" if YOUTUBE_API_KEY else "not configured",
        "api_key_configured": GROQ_API_KEY is not None
    }

@app.get("/models")
async def list_models():
    return {
        "available_models": MODELS,
        "current_model": PREFERRED_MODEL,
        "note": "Current working models on Groq"
    }

@app.get("/")
async def root():
    return {
        "message": "🚀 Cortexa Backend Running",
        "status": "active",
        "current_model": PREFERRED_MODEL,
        "endpoints": ["/chat", "/upload-document", "/generate-audio", "/youtube-search", "/health", "/models"]
    }

