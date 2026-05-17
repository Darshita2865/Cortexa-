# 🧠 Cortexa — AI Knowledge Intelligence Platform

**Cortexa** is an AI-powered system that transforms documents into **interactive knowledge, research insights, and learning tools**.

> Think of it as: *NotebookLM + Research Assistant + Knowledge Graph + AI Agents*

---

## 🚀 Overview

**Cortexa = Cortex + Intelligence**

Inspired by the human brain’s **cerebral cortex**, Cortexa is designed to:

* 🧠 Understand information
* 🔍 Analyze deeply
* 📊 Organize knowledge
* 💡 Generate insights

---

## ✨ Features

### 📂 Knowledge Sources

Upload and process:

* PDF
* DOCX
* TXT
* Research papers (basic support)

---

### 💬 AI Document Chat

* Ask questions about uploaded documents
* Get structured, easy-to-understand answers

---

### 🔊 Audio Responses

* Convert AI responses into speech
* Useful for learning on the go

---

### 📄 Document Processing

* Extracts text from:

  * PDFs (PyPDF2)
  * DOCX (python-docx)
  * TXT files

---

### 🔀 Hybrid AI System

Cortexa intelligently switches between:

* ⚡ Grok API → Fast, high-quality responses
* 🖥️ Ollama (Llama3) → Free fallback

---

## 🏗️ Architecture

```
Frontend (Planned: React / Next.js)
        ↓
Backend (FastAPI)
        ↓
Document Processing
        ↓
AI Response Layer (Gemini + Ollama)
```

---

## ⚙️ Tech Stack

* **Backend:** FastAPI
* **AI Models:** Gemini API, Ollama
* **Text-to-Speech:** gTTS
* **Document Parsing:** PyPDF2, python-docx
* **Language:** Python

---

## 🧪 API Endpoints

### 🔹 `POST /chat`

Chat with AI

**Request:**

```json
{
  "message": "Explain AI simply",
  "document_content": "optional text",
  "audio": false
}
```

---

### 🔹 `POST /upload-document`

Upload a document and extract content

---

### 🔹 `GET /audio/{filename}`

Retrieve generated audio response

---

### 🔹 `GET /health`

Check system status

---

## 🚀 Getting Started

### 1️⃣ Clone the repository

```bash
git clone https://github.com/your-username/cortexa
cd cortexa
```

### 2️⃣ Install dependencies

```bash
pip install -r requirements.txt
```

### 3️⃣ Run the server

```bash
uvicorn backend:app --reload
```

---

## 🔑 Environment Variables


---

## ⚖️ Pros & Limitations

### ✅ Advantages

* Centralized document intelligence
* Hybrid AI (cloud + local)
* Fast and flexible

### ❌ Limitations

* No vector database yet
* Limited document size handling
* Basic AI reasoning (MVP stage)

---

## 🛣️ Roadmap

* [ ] Vector database integration (FAISS / Pinecone)
* [ ] Multi-agent system
* [ ] Knowledge graph visualization
* [ ] Web search integration
* [ ] Frontend UI (React / Next.js)
* [ ] Advanced research tools

---

## 🎯 Vision

Cortexa aims to become:

> 🧠 The **operating system for knowledge, learning, and research**



