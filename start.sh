#!/bin/bash
# IndustrialMind — start both servers
# Usage: ./start.sh

set -e

echo ""
echo "🏭 IndustrialMind — Starting..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# check .env exists
if [ ! -f backend/.env ]; then
  echo "⚠️  No .env found — copying from .env.example"
  cp backend/.env.example backend/.env
  echo "✏️  Edit backend/.env and add your GROQ_API_KEY, then re-run."
  echo ""
fi

# check groq key set
GROQ_KEY=$(grep GROQ_API_KEY backend/.env | cut -d= -f2 | tr -d ' ')
if [ -z "$GROQ_KEY" ] || [ "$GROQ_KEY" = "your_groq_key_here" ]; then
  echo "⚠️  GROQ_API_KEY not set in backend/.env"
  echo "   Get free key: https://console.groq.com/keys"
  echo ""
fi

# create data dirs
mkdir -p backend/data/chroma backend/data/uploads backend/eval

# install backend deps
echo "📦 Installing backend dependencies..."
cd backend
pip install -r requirements.txt -q --break-system-packages 2>/dev/null || \
pip install -r requirements.txt -q
cd ..

# install frontend deps
echo "📦 Installing frontend dependencies..."
cd frontend
npm install --silent 2>/dev/null
cd ..

# start FastAPI in background
echo ""
echo "🚀 Starting FastAPI backend on http://127.0.0.1:8000"
echo "   API docs: http://127.0.0.1:8000/docs"
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# wait for backend to be ready
echo "⏳ Waiting for backend..."
for i in {1..15}; do
  if curl -s http://127.0.0.1:8000/ > /dev/null 2>&1; then
    echo "✅ Backend ready"
    break
  fi
  sleep 1
done

# start Next.js frontend
echo ""
echo "🎨 Starting Next.js frontend on http://localhost:3000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
cd frontend
npm run dev

# cleanup on exit
trap "kill $BACKEND_PID 2>/dev/null" EXIT