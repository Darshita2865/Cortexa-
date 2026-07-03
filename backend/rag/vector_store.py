"""
Vector Store Module
Manages storage and retrieval of document embeddings using ChromaDB
"""

from typing import List, Dict, Optional, Any
import os
import uuid

class VectorStore:
    def __init__(self, persist_directory: str = "./vector_store"):
        """
        Initialize vector store
        
        Args:
            persist_directory: Directory to store vector data
        """
        self.persist_directory = persist_directory
        self.collection = None
        self.client = None
        self._initialized = False
        
        # Ensure directory exists
        os.makedirs(persist_directory, exist_ok=True)
    
    def initialize(self, collection_name: str = "cortexa_docs"):
        """Initialize ChromaDB (lazy loading)"""
        if self._initialized:
            return
        
        try:
            import chromadb
            from chromadb.config import Settings
            
            self.client = chromadb.PersistentClient(
                path=self.persist_directory,
                settings=Settings(
                    anonymized_telemetry=False,
                    chroma_db_impl="duckdb+parquet"
                )
            )
            
            # Get or create collection
            self.collection = self.client.get_or_create_collection(
                name=collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            
            self._initialized = True
            print(f"✅ Vector store initialized: {self.persist_directory}")
            print(f"📚 Collection: {collection_name}, Chunks: {self.collection.count()}")
            
        except ImportError:
            print("❌ chromadb not installed. Install with: pip install chromadb")
            self._initialized = False
        except Exception as e:
            print(f"❌ Vector store initialization error: {e}")
            self._initialized = False
    
    def add_document(self, doc_id: str, chunks: List[Dict], embeddings: List[List[float]]):
        """
        Add document chunks and their embeddings to the vector store
        
        Args:
            doc_id: Unique document identifier
            chunks: List of chunk dictionaries with 'text' and metadata
            embeddings: List of embedding vectors (same order as chunks)
        """
        if not self._initialized:
            self.initialize()
        
        if not self.collection:
            print("⚠️ Vector store not initialized. Cannot add document.")
            return
        
        if not chunks or not embeddings:
            print("⚠️ No chunks or embeddings to add.")
            return
        
        if len(chunks) != len(embeddings):
            print(f"⚠️ Mismatch: {len(chunks)} chunks, {len(embeddings)} embeddings")
            return
        
        try:
            # Prepare data for ChromaDB
            ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
            texts = [chunk['text'] for chunk in chunks]
            metadatas = [
                {
                    'doc_id': doc_id,
                    'chunk_index': chunk.get('index', i),
                    'char_start': chunk.get('char_start', 0),
                    'char_end': chunk.get('char_end', 0),
                    'length': chunk.get('length', 0)
                }
                for i, chunk in enumerate(chunks)
            ]
            
            # Add to collection
            self.collection.add(
                ids=ids,
                documents=texts,
                embeddings=embeddings,
                metadatas=metadatas
            )
            
            print(f"📄 Added {len(chunks)} chunks for document: {doc_id}")
            
        except Exception as e:
            print(f"❌ Error adding document to vector store: {e}")
    
    def search(self, query_embedding: List[float], top_k: int = 5) -> List[Dict]:
        """
        Search for similar chunks using vector similarity
        
        Args:
            query_embedding: Embedding vector of the query
            top_k: Number of results to return
        
        Returns:
            List of matching chunks with metadata and distances
        """
        if not self._initialized:
            self.initialize()
        
        if not self.collection:
            print("⚠️ Vector store not initialized. Cannot search.")
            return []
        
        try:
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k
            )
            
            # Format results
            formatted_results = []
            if results['ids'] and results['ids'][0]:
                for i in range(len(results['ids'][0])):
                    formatted_results.append({
                        'id': results['ids'][0][i],
                        'text': results['documents'][0][i] if results['documents'] else '',
                        'metadata': results['metadatas'][0][i] if results['metadatas'] else {},
                        'distance': results['distances'][0][i] if results['distances'] else 0
                    })
            
            return formatted_results
            
        except Exception as e:
            print(f"❌ Search error: {e}")
            return []
    
    def get_document_chunks(self, doc_id: str) -> List[Dict]:
        """
        Retrieve all chunks for a specific document
        
        Args:
            doc_id: Document identifier
        
        Returns:
            List of chunks with metadata
        """
        if not self._initialized:
            self.initialize()
        
        if not self.collection:
            return []
        
        try:
            results = self.collection.get(
                where={"doc_id": doc_id}
            )
            
            formatted_results = []
            if results['ids']:
                for i in range(len(results['ids'])):
                    formatted_results.append({
                        'id': results['ids'][i],
                        'text': results['documents'][i] if results['documents'] else '',
                        'metadata': results['metadatas'][i] if results['metadatas'] else {}
                    })
            
            return formatted_results
            
        except Exception as e:
            print(f"❌ Get document chunks error: {e}")
            return []
    
    def delete_document(self, doc_id: str):
        """
        Delete all chunks for a document
        
        Args:
            doc_id: Document identifier
        """
        if not self._initialized:
            self.initialize()
        
        if not self.collection:
            return
        
        try:
            # Get all IDs for this document
            results = self.collection.get(where={"doc_id": doc_id})
            
            if results['ids']:
                self.collection.delete(ids=results['ids'])
                print(f"🗑️ Deleted {len(results['ids'])} chunks for document: {doc_id}")
            else:
                print(f"ℹ️ No chunks found for document: {doc_id}")
            
        except Exception as e:
            print(f"❌ Delete document error: {e}")
    
    def delete_all(self):
        """Delete all documents from the vector store"""
        if not self._initialized:
            self.initialize()
        
        if not self.collection:
            return
        
        try:
            # Get all IDs
            results = self.collection.get()
            if results['ids']:
                self.collection.delete(ids=results['ids'])
                print(f"🗑️ Deleted all {len(results['ids'])} chunks")
            else:
                print("ℹ️ Vector store is already empty")
            
        except Exception as e:
            print(f"❌ Delete all error: {e}")
    
    def get_count(self) -> int:
        """
        Get total number of chunks in the vector store
        
        Returns:
            Number of chunks
        """
        if not self._initialized:
            self.initialize()
        
        if not self.collection:
            return 0
        
        try:
            return self.collection.count()
        except Exception as e:
            print(f"❌ Get count error: {e}")
            return 0
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the vector store
        
        Returns:
            Dictionary with statistics
        """
        if not self._initialized:
            self.initialize()
        
        if not self.collection:
            return {
                'initialized': False,
                'total_chunks': 0,
                'directory': self.persist_directory
            }
        
        try:
            # Get all documents to count unique doc_ids
            results = self.collection.get()
            doc_ids = set()
            if results['metadatas']:
                for meta in results['metadatas']:
                    if meta and 'doc_id' in meta:
                        doc_ids.add(meta['doc_id'])
            
            return {
                'initialized': True,
                'total_chunks': self.collection.count(),
                'total_documents': len(doc_ids),
                'directory': self.persist_directory,
                'collection_name': self.collection.name if hasattr(self.collection, 'name') else 'unknown'
            }
            
        except Exception as e:
            print(f"❌ Get stats error: {e}")
            return {
                'initialized': True,
                'total_chunks': self.collection.count() if self.collection else 0,
                'error': str(e)
            }
