#!/bin/bash

# Aztec Sandbox Management Script
# Handles starting, stopping, and checking the Aztec sandbox

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Aztec sandbox is running via Docker
check_docker_sandbox() {
    if docker ps --filter "name=aztec-sandbox" --format "{{.Names}}" | grep -q "aztec-sandbox"; then
        echo -e "${GREEN}✓${NC} Aztec sandbox running via Docker"
        return 0
    fi
    return 1
}

# Check if Aztec is running locally
check_local_sandbox() {
    if curl -s http://localhost:8080/status > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Aztec sandbox responding on port 8080"
        return 0
    fi
    return 1
}

# Start Aztec sandbox via docker-compose
start_docker() {
    echo -e "${YELLOW}Starting Aztec sandbox via docker-compose...${NC}"
    cd "$PROJECT_ROOT"

    # Stop any conflicting containers
    docker stop aztec-sandbox 2>/dev/null || true
    docker rm aztec-sandbox 2>/dev/null || true

    # Start with docker-compose
    docker-compose up -d aztec-sandbox

    echo -e "${YELLOW}Waiting for Aztec sandbox to be ready (this may take 2-3 minutes)...${NC}"

    # Wait for health check
    for i in {1..60}; do
        if check_local_sandbox; then
            echo -e "${GREEN}✓${NC} Aztec sandbox is ready!"
            return 0
        fi
        echo -n "."
        sleep 5
    done

    echo -e "${RED}✗${NC} Aztec sandbox failed to start within 5 minutes"
    echo -e "${YELLOW}Check logs with: docker logs aztec-sandbox${NC}"
    return 1
}

# Start Aztec sandbox using local installation
start_local() {
    if [ ! -f "$HOME/.aztec/bin/aztec" ]; then
        echo -e "${RED}✗${NC} Local Aztec installation not found at $HOME/.aztec/bin/aztec"
        echo -e "${YELLOW}Install Aztec CLI first: https://docs.aztec.network/guides/developer_guides/getting_started${NC}"
        return 1
    fi

    echo -e "${YELLOW}Starting Aztec sandbox using local installation...${NC}"
    $HOME/.aztec/bin/aztec start --sandbox &

    echo -e "${YELLOW}Waiting for sandbox to start...${NC}"
    sleep 10

    if check_local_sandbox; then
        echo -e "${GREEN}✓${NC} Aztec sandbox started successfully"
        return 0
    else
        echo -e "${RED}✗${NC} Failed to start Aztec sandbox"
        return 1
    fi
}

# Stop Aztec sandbox
stop() {
    echo -e "${YELLOW}Stopping Aztec sandbox...${NC}"

    # Stop Docker version
    if docker ps --filter "name=aztec" --format "{{.Names}}" | grep -q "aztec"; then
        docker stop $(docker ps --filter "name=aztec" --format "{{.Names}}") 2>/dev/null || true
        echo -e "${GREEN}✓${NC} Docker containers stopped"
    fi

    # Kill local processes
    pkill -f "aztec start --sandbox" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Local processes stopped"
}

# Show status
status() {
    echo "Aztec Sandbox Status:"
    echo "===================="

    if check_local_sandbox; then
        echo -e "${GREEN}✓${NC} Sandbox is running and responding"

        # Check which method is running
        if check_docker_sandbox; then
            echo -e "${GREEN}✓${NC} Running via Docker"
            docker ps --filter "name=aztec" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        else
            echo -e "${GREEN}✓${NC} Running via local installation"
        fi
    else
        echo -e "${RED}✗${NC} Sandbox is not running"
        echo -e "${YELLOW}Start with: ./scripts/aztec-sandbox.sh start${NC}"
    fi
}

# Restart sandbox
restart() {
    echo -e "${YELLOW}Restarting Aztec sandbox...${NC}"
    stop
    sleep 3
    start_docker
}

# Main command handler
case "${1:-status}" in
    start)
        if check_local_sandbox; then
            echo -e "${GREEN}✓${NC} Aztec sandbox is already running"
            exit 0
        fi
        start_docker || start_local
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    logs)
        docker logs -f aztec-sandbox 2>&1 | grep -v "Cannot enqueue vote" || true
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Commands:"
        echo "  start   - Start Aztec sandbox (prefers Docker)"
        echo "  stop    - Stop all Aztec processes"
        echo "  restart - Restart Aztec sandbox"
        echo "  status  - Check if sandbox is running"
        echo "  logs    - Follow sandbox logs"
        exit 1
        ;;
esac
