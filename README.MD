# Cognera

Cognera is an intelligent, AI-powered study assistant designed to streamline academic workflows. It integrates document-based retrieval (RAG) with a general-purpose AI companion, allowing students to extract, summarize, and interact with complex study materials while also functioning as a versatile research assistant.

## Overview

Cognera addresses the challenge of information overload in academic study. By leveraging the Google Gemini API, it allows users to upload documents, perform context-aware queries, and generate structured study materials like flashcards and plans. It is built to be a reliable, grounded academic tool that prioritizes factual accuracy and user focus.

## Key Features

- **Context-Aware Chat:** Seamlessly switches between document-grounded RAG (Retrieval-Augmented Generation) and general-purpose reasoning.
- **Intelligent Extraction:** Automated PDF parsing and text chunking to facilitate deep analysis of academic sources.
- **Study Tools:** Integrated support for flashcard generation, document summarization, and structured study planning.
- **High-Performance Interface:** A minimalist, hand-built dark-mode UI designed to minimize cognitive load and eye strain.
- **Advanced UX:** Includes streaming AI responses, keyboard-driven navigation, and conversation management (forking and editing).

## Technical Stack

### Frontend

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (Custom Design System)
- **State & Auth:** Supabase Auth, React Hooks
- **Iconography:** Lucide React
- **Markdown:** react-markdown, @tailwindcss/typography

### Backend

- **Framework:** FastAPI (Python)
- **AI Integration:** Google Gemini API (gemini-2.5-flash-lite)
- **Embeddings:** gemini-embedding-001 (768-dim vectors)
- **PDF Processing:** PyMuPDF (fitz)
- **Infrastructure:** Supabase (Postgres/pgvector, Storage)

## Getting Started

### Prerequisites

- Node.js (v18+)
- Python (v3.10+)
- Supabase Account
- Google Gemini API Key

### Installation

1. Clone the repository:
   ```bash
   git clone [https://github.com/fretdev/Cognera.git](https://github.com/fretdev/Cognera.git)
   cd Cognera
   ```
2. Setup the backend:
   ```bash
   cd backend
   pip install -r requirements.txt
   # Copy .env.example to .env and configure your keys
   python main.py
   ```
3. Setup the frontend:
   ```bash
   cd ../frontend
   npm install
   # Copy .env.local.example to .env.local and configure your keys
   npm run dev
   ```
