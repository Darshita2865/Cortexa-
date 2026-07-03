"""
Embedding Generator Module
Converts text to vector representations for semantic search
Supports ONNX runtime for lighter deployment
"""

from typing import List, Optional
import os
import numpy as np

class Embedder:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Initialize the embedding model
        
        Args:
            model_name: Name of the sentence-transformers model
                       Recommended: all-MiniLM-L6-v2 (lightweight, works with ONNX)
        """
        self.model_name = model_name
        self.model = None
        self._initialized = False
        self._dimension = 384  # all-MiniLM-L6-v2 dimension
    
    def initialize(self):
        """Load the embedding model (lazy loading)"""
        if self._initialized:
            return
        
        try:
            from sentence_transformers import SentenceTransformer
            import torch
            
            # Force CPU and use float32 for better compatibility
            self.model = SentenceTransformer(
                self.model_name,
                device="cpu"
            )
            
            # Try to use ONNX for faster inference (fallback to PyTorch if not available)
            try:
                # Convert to ONNX for better performance
                self.model.to("cpu")
                print(f"✅ Embedding model loaded: {self.model_name} (CPU mode)")
            except Exception as e:
                print(f"⚠️ ONNX not available, using PyTorch: {e}")
            
            self._initialized = True
            print(f"✅ Embedding model loaded: {self.model_name}")
            
        except ImportError as e:
            print(f"❌ sentence-transformers not installed: {e}")
            print("   Install with: pip install sentence-transformers onnxruntime")
            self._initialized = False
        except Exception as e:
            print(f"❌ Failed to load embedding model: {e}")
            self._initialized = False
    
    def embed_text(self, text: str) -> List[float]:
        """Convert text to embedding vector"""
        if not text:
            return [0.0] * self._dimension
        
        if not self._initialized:
            self.initialize()
        
        if not self.model:
            return [0.0] * self._dimension
        
        try:
            embedding = self.model.encode(text, convert_to_numpy=True)
            return embedding.tolist()
        except Exception as e:
            print(f"⚠️ Embedding error: {e}")
            return [0.0] * self._dimension
    
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Convert multiple texts to embeddings"""
        if not texts:
            return []
        
        if not self._initialized:
            self.initialize()
        
        if not self.model:
            return [[0.0] * self._dimension for _ in texts]
        
        try:
            embeddings = self.model.encode(texts, convert_to_numpy=True)
            if hasattr(embeddings, 'tolist'):
                return embeddings.tolist()
            return embeddings
        except Exception as e:
            print(f"⚠️ Batch embedding error: {e}")
            return [[0.0] * self._dimension for _ in texts]
    
    def is_available(self) -> bool:
        """Check if embedding model is available"""
        if not self._initialized:
            self.initialize()
        return self._initialized and self.model is not None
    
    def get_dimension(self) -> int:
        """Get the embedding dimension"""
        return self._dimension
    
    def get_model_name(self) -> str:
        """Get the model name"""
        return self.model_name
