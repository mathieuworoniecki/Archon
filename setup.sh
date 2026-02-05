#!/bin/bash
# Archon - One-command setup script
# Usage: ./setup.sh

set -e

echo "🔮 Archon - Digital Investigation Platform"
echo "==========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo -e "${GREEN}✓${NC} Docker is installed"

# 2. Create .env from .env.example if not exists
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✓${NC} Created .env from .env.example"
        echo -e "${YELLOW}⚠${NC} Please edit .env and add your GEMINI_API_KEY for AI features"
    else
        echo "# Archon Environment Configuration" > .env
        echo "GEMINI_API_KEY=" >> .env
        echo "DOCUMENTS_PATH=./documents" >> .env
        echo -e "${GREEN}✓${NC} Created default .env file"
    fi
else
    echo -e "${GREEN}✓${NC} .env file already exists"
fi

# 3. Create documents directory if not exists
mkdir -p documents
echo -e "${GREEN}✓${NC} Documents directory ready"

# 4. Build and start all services
echo ""
echo "🚀 Building and starting Archon..."
echo ""

docker compose -f docker-compose.prod.yaml up -d --build

echo ""
echo "==========================================="
echo -e "${GREEN}✓ Archon is now running!${NC}"
echo ""
echo "📊 Access points:"
echo "   • Frontend:    http://localhost:3100"
echo "   • API:         http://localhost:8100"
echo "   • Meilisearch: http://localhost:7701"
echo "   • Qdrant:      http://localhost:6335/dashboard"
echo ""
echo "📁 Place your documents in: ./documents/"
echo ""
echo "🔑 For AI features, add your Gemini API key to .env:"
echo "   GEMINI_API_KEY=your_key_here"
echo ""
echo "📖 Commands:"
echo "   • Stop:    docker compose -f docker-compose.prod.yaml down"
echo "   • Logs:    docker compose -f docker-compose.prod.yaml logs -f"
echo "   • Reset:   docker compose -f docker-compose.prod.yaml down -v"
echo ""
