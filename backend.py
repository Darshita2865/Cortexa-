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

# ================= LOAD ENVIRONMENT VARIABLES =================
load_dotenv()

# Get API key from environment variable
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Initialize Groq client
if not GROQ_API_KEY:
    print("=" * 50)
    print("❌ ERROR: GROQ_API_KEY not found in .env file!")
    print("Please create .env file with: GROQ_API_KEY=your_key_here")
    print("Get free key from: https://console.groq.com")
    print("=" * 50)
    client = None
else:
    client = Groq(api_key=GROQ_API_KEY)
    print("=" * 50)
    print("✅ Groq API key loaded successfully!")
    print(f"📊 API Key: {GROQ_API_KEY[:10]}...")
    print("=" * 50)

app = FastAPI()

# ================= CORS =================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================= MODELS =================
class Message(BaseModel):
    message: str
    document_content: Optional[str] = None
    audio: bool = False

# ================= AVAILABLE MODELS =================
# Current working models on Groq (as of 2026)
MODELS = {
    "fast": "llama-3.1-8b-instant",      # Fastest, good for general chat
    "balanced": "llama-3.3-70b-versatile", # Best balance of speed/quality
    "powerful": "mixtral-8x7b-32768",     # Very capable
    "coding": "deepseek-r1-distill-llama-70b" # Great for coding
}

# Choose your preferred model
PREFERRED_MODEL = MODELS["balanced"]  # Using Llama 3.3 70B (very powerful)

# ================= SYSTEM PROMPT =================
SYSTEM_PROMPT = """You are Cortexa, a powerful AI assistant. 

IMPORTANT RULES:
1. NEVER give generic responses like "Got it! Let me help you with that"
2. ALWAYS answer the user's question directly with SPECIFIC information
3. Be conversational, friendly, and helpful
4. Use **bold** for emphasis and bullet points for lists
5. Keep responses informative but not overly long

EXAMPLES OF GOOD RESPONSES:
- User: "hello" → "Hello! 👋 I'm Cortexa. What can I help you with today?"
- User: "who are you" → "I'm Cortexa, your AI assistant powered by Groq's Llama 3 model. I can help with programming, AI concepts, document analysis, and more!"
- User: "what is python" → "Python is a high-level programming language created by Guido van Rossum in 1991. It's known for its simple, readable syntax..."

Never respond with generic phrases. Always provide specific, helpful answers."""

# ================= AI RESPONSE FUNCTION =================
async def get_ai_response(message: str, context: Optional[str] = None) -> str:
    """Get intelligent response from Groq API"""
    
    # Check if Groq client is available
    if not client:
        print("❌ No Groq client available")
        return "⚠️ API key not configured. Please check your .env file."
    
    try:
        print(f"🤖 Calling Groq API with model: {PREFERRED_MODEL}")
        print(f"📝 User message: {message[:100]}...")
        
        # Build messages
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]
        
        # Add document context if available
        if context and context != "null" and len(context) > 10:
            messages.append({
                "role": "system",
                "content": f"Reference document: {context[:1000]}"
            })
            print(f"📄 Document context added ({len(context[:1000])} chars)")
        
        # Add user message
        messages.append({"role": "user", "content": message})
        
        # Call Groq API with working model
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
        print(f"📤 Response preview: {response[:100]}...")
        return response
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Groq API Error: {error_msg}")
        
        # Try fallback model if current one fails
        if "decommissioned" in error_msg or "not found" in error_msg:
            print("🔄 Trying fallback model...")
            try:
                fallback_model = MODELS["fast"]
                print(f"🤖 Retrying with: {fallback_model}")
                
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
                
                response = completion.choices[0].message.content
                print(f"✅ Fallback model successful!")
                return response
                
            except Exception as fallback_error:
                print(f"❌ Fallback also failed: {fallback_error}")
                return f"⚠️ Error: {error_msg[:200]}"
        
        return f"⚠️ Error: {error_msg[:200]}"

# ================= CHAT ENDPOINT =================
@app.post("/chat")
async def chat(data: Message):
    try:
        user_msg = data.message.strip()
        print(f"\n📥 Received: {user_msg}")
        
        if not user_msg:
            return {"response": "Please enter a message! 💙"}
        
        # Get AI response
        reply = await get_ai_response(user_msg, data.document_content)
        
        print(f"✅ Response sent\n")
        
        return {
            "role": "assistant",
            "response": reply
        }
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return {"response": f"Error: {str(e)}. Please try again."}

# ================= DOCUMENT UPLOAD =================
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

# ================= AUDIO GENERATION =================
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

# ================= HEALTH CHECK =================
@app.get("/health")
async def health():
    groq_status = "not_configured"
    model_info = "none"
    available_models = []
    
    if client:
        try:
            test = client.chat.completions.create(
                model=MODELS["fast"],
                messages=[{"role": "user", "content": "test"}],
                max_tokens=5
            )
            groq_status = "connected"
            model_info = PREFERRED_MODEL
            available_models = list(MODELS.values())
            print("✅ Health check: Groq API connected")
        except Exception as e:
            groq_status = f"error: {str(e)[:50]}"
            print(f"❌ Health check error: {e}")
    
    return {
        "status": "running",
        "message": "✅ Cortexa Backend with Groq AI",
        "groq_api": groq_status,
        "current_model": model_info,
        "available_models": available_models,
        "api_key_configured": GROQ_API_KEY is not None
    }

@app.get("/models")
async def list_models():
    """List all available Groq models"""
    return {
        "available_models": MODELS,
        "current_model": PREFERRED_MODEL,
        "note": "These are the current working models on Groq"
    }

@app.get("/")
async def root():
    return {
        "message": "🚀 Cortexa Backend Running",
        "status": "active",
        "current_model": PREFERRED_MODEL,
        "endpoints": ["/chat", "/upload-document", "/generate-audio", "/health", "/models"]
    }

# ================= RUN =================
# This is the CORRECT production-ready section
if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("🚀 STARTING CORTEXA BACKEND")
    print("=" * 50)
    print(f"📍 Local: http://127.0.0.1:8000")
    print(f"📝 Health check: http://127.0.0.1:8000/health")
    print(f"📋 Models: http://127.0.0.1:8000/models")
    print("=" * 50)
    
    if not GROQ_API_KEY:
        print("\n⚠️  WARNING: No API Key Found!")
        print("1. Create .env file with: GROQ_API_KEY=your_key_here")
        print("2. Get key from: https://console.groq.com")
        print("\nThe backend will still run but will return errors.\n")
    else:
        print(f"\n✅ API Key Loaded: {GROQ_API_KEY[:15]}...")
        print(f"✅ Current Model: {PREFERRED_MODEL}")
        print(f"✅ Available Models:")
        for key, model in MODELS.items():
            print(f"   • {key}: {model}")
        print("\n🎯 READY TO ANSWER QUESTIONS!\n")
    
    # Get port from environment variable (for Render/Railway) or use 8000 for local
    port = int(os.getenv("PORT", 8000))
    
    # For production (Render) - host 0.0.0.0
    # For local development - host 127.0.0.1
    is_production = os.getenv("RENDER") == "true" or os.getenv("PORT") is not None
    
    if is_production:
        print("🌍 Running in PRODUCTION mode")
        uvicorn.run(app, host="0.0.0.0", port=port)
    else:
        print("💻 Running in LOCAL mode")
        if __name__ == "__main__":
            uvicorn.run(app, host="0.0.0.0", port=10000)