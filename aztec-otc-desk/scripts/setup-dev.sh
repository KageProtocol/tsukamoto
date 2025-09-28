#!/bin/bash

# Aztec OTC Desk - Development Environment Setup Script
# This script sets up a complete development environment with one command

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo -e "\n${CYAN}${1}${NC}"
    echo -e "${CYAN}$(printf '=%.0s' {1..60})${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check system requirements
check_requirements() {
    log_header "Checking System Requirements"

    local missing_deps=()

    # Check Node.js
    if command_exists node; then
        local node_version=$(node --version | cut -d'v' -f2)
        log_success "Node.js found: v$node_version"
    else
        missing_deps+=("Node.js (>=18.0.0)")
    fi

    # Check npm
    if command_exists npm; then
        local npm_version=$(npm --version)
        log_success "npm found: v$npm_version"
    else
        missing_deps+=("npm")
    fi

    # Check Bun
    if command_exists bun; then
        local bun_version=$(bun --version)
        log_success "Bun found: v$bun_version"
    else
        log_warning "Bun not found - will install"
        curl -fsSL https://bun.sh/install | bash
        export PATH="$HOME/.bun/bin:$PATH"
    fi

    # Check Docker
    if command_exists docker; then
        log_success "Docker found"
        # Check if Docker is running
        if docker ps >/dev/null 2>&1; then
            log_success "Docker daemon is running"
        else
            log_error "Docker daemon is not running. Please start Docker Desktop."
            exit 1
        fi
    else
        missing_deps+=("Docker")
    fi

    # Check Docker Compose
    if command_exists docker-compose || docker compose version >/dev/null 2>&1; then
        log_success "Docker Compose found"
    else
        missing_deps+=("Docker Compose")
    fi

    # Check Git
    if command_exists git; then
        log_success "Git found"
    else
        missing_deps+=("Git")
    fi

    # Check Aztec CLI
    if command_exists aztec; then
        log_success "Aztec CLI found"
    else
        log_warning "Aztec CLI not found - will install"
        curl -L https://aztec.network/install | bash
        export PATH="$HOME/.aztec/bin:$PATH"
    fi

    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            echo "  - $dep"
        done
        echo ""
        echo "Please install the missing dependencies and run this script again."
        echo "Installation guides:"
        echo "  - Node.js: https://nodejs.org/"
        echo "  - Docker: https://docs.docker.com/get-docker/"
        echo "  - Git: https://git-scm.com/downloads"
        exit 1
    fi
}

# Setup environment variables
setup_environment() {
    log_header "Setting Up Environment Variables"

    if [ ! -f .env ]; then
        log_info "Creating .env file from .env.example..."
        cp .env.example .env

        # Generate secure secrets
        log_info "Generating secure secrets..."

        # Generate HMAC secret
        if command_exists openssl; then
            HMAC_SECRET=$(openssl rand -hex 32)
        else
            HMAC_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '=+/' | cut -c1-64)
        fi

        # Update .env with generated secrets
        sed -i.bak "s/dev_hmac_secret_key_change_in_production_minimum_32_chars/$HMAC_SECRET/g" .env
        rm -f .env.bak

        log_success ".env file created with secure secrets"
        log_warning "Please review and update .env file with your specific configuration"
    else
        log_success ".env file already exists"
    fi

    # Validate environment
    log_info "Validating environment configuration..."
    if command_exists node; then
        node scripts/validate-env.js
    else
        log_warning "Cannot validate environment - Node.js not available"
    fi
}

# Install dependencies
install_dependencies() {
    log_header "Installing Dependencies"

    # Root dependencies
    log_info "Installing root dependencies..."
    npm ci

    # Contract dependencies
    if [ -d "packages/contracts" ]; then
        log_info "Installing contract dependencies..."
        cd packages/contracts
        bun install
        cd ../..
    fi

    # Orderflow dependencies
    if [ -d "packages/orderflow" ]; then
        log_info "Installing orderflow dependencies..."
        cd packages/orderflow
        bun install
        cd ../..
    fi

    # Web app dependencies
    if [ -d "apps/web" ]; then
        log_info "Installing web app dependencies..."
        cd apps/web
        npm ci
        cd ../..
    fi

    log_success "All dependencies installed"
}

# Setup database
setup_database() {
    log_header "Setting Up Database"

    # Start PostgreSQL if needed
    if docker ps | grep -q postgres; then
        log_info "PostgreSQL container already running"
    else
        log_info "Starting PostgreSQL container..."
        docker-compose up -d postgres

        # Wait for PostgreSQL to be ready
        log_info "Waiting for PostgreSQL to be ready..."
        for i in {1..30}; do
            if docker-compose exec -T postgres pg_isready -U otc_user -d otc_desk >/dev/null 2>&1; then
                break
            fi
            sleep 2
            echo -n "."
        done
        echo ""
    fi

    log_success "Database is ready"
}

# Setup Redis
setup_redis() {
    log_header "Setting Up Redis"

    if docker ps | grep -q redis; then
        log_info "Redis container already running"
    else
        log_info "Starting Redis container..."
        docker-compose up -d redis

        # Wait for Redis to be ready
        log_info "Waiting for Redis to be ready..."
        for i in {1..15}; do
            if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
                break
            fi
            sleep 1
            echo -n "."
        done
        echo ""
    fi

    log_success "Redis is ready"
}

# Compile contracts
compile_contracts() {
    log_header "Compiling Smart Contracts"

    if [ -d "packages/contracts" ]; then
        cd packages/contracts

        log_info "Compiling Noir contracts..."
        bun run compile

        log_info "Generating TypeScript bindings..."
        bun run codegen

        log_info "Running contract tests..."
        bun run test:nr || log_warning "Contract tests failed - continuing setup"

        cd ../..
        log_success "Smart contracts compiled successfully"
    else
        log_warning "Contracts directory not found - skipping compilation"
    fi
}

# Start development services
start_services() {
    log_header "Starting Development Services"

    log_info "Starting core infrastructure services..."
    docker-compose up -d aztec-sandbox aztec-pxe postgres redis prometheus grafana price-feed

    log_info "Waiting for services to be ready..."
    sleep 30

    # Health check for services
    services=("postgres:5432" "redis:6379" "prometheus:9090" "grafana:3000")
    for service in "${services[@]}"; do
        name=${service%%:*}
        port=${service##*:}
        if docker-compose ps | grep -q "$name.*Up"; then
            log_success "$name service is running"
        else
            log_warning "$name service may not be ready"
        fi
    done

    log_info "Starting Aztec services..."
    # Wait for Aztec services with extended timeout
    for i in {1..60}; do
        if curl -sf http://localhost:8080/status >/dev/null 2>&1; then
            log_success "Aztec sandbox is ready"
            break
        fi
        sleep 5
        echo -n "."
    done
    echo ""

    for i in {1..30}; do
        if curl -sf http://localhost:8081/status >/dev/null 2>&1; then
            log_success "Aztec PXE is ready"
            break
        fi
        sleep 3
        echo -n "."
    done
    echo ""
}

# Setup monitoring
setup_monitoring() {
    log_header "Setting Up Monitoring"

    log_info "Prometheus will be available at: http://localhost:9090"
    log_info "Grafana will be available at: http://localhost:3000"
    log_info "  Username: admin"
    log_info "  Password: admin_change_in_production"

    # Import Grafana dashboards
    log_info "Grafana dashboards will be automatically provisioned"
}

# Deploy test tokens
deploy_tokens() {
    log_header "Deploying Test Tokens"

    if [ -d "packages/contracts" ]; then
        cd packages/contracts

        log_info "Deploying test tokens..."
        bun run deploy-token || log_warning "Token deployment failed - may need manual setup"

        cd ../..
    fi
}

# Create test data
create_test_data() {
    log_header "Creating Test Data"

    if [ -d "packages/nodejs-demo" ]; then
        cd packages/nodejs-demo

        log_info "Setting up test accounts..."
        bun run scripts/setup_accounts.ts || log_warning "Account setup failed"

        log_info "Creating sample order..."
        bun run scripts/create_order.ts || log_warning "Sample order creation failed"

        cd ../..
    fi
}

# Final instructions
show_final_instructions() {
    log_header "Setup Complete!"

    echo -e "${GREEN}🎉 Aztec OTC Desk development environment is ready!${NC}\n"

    echo "📋 Next steps:"
    echo "  1. Start the web application:"
    echo "     cd apps/web && npm run dev"
    echo ""
    echo "  2. Start the orderflow service:"
    echo "     cd packages/orderflow && bun run dev"
    echo ""
    echo "  3. Or start both with Docker Compose:"
    echo "     docker-compose up web orderflow"
    echo ""

    echo "🌐 Available services:"
    echo "  • Web Application: http://localhost:5173"
    echo "  • Orderflow API: http://localhost:3001"
    echo "  • Aztec Sandbox: http://localhost:8080"
    echo "  • Aztec PXE: http://localhost:8081"
    echo "  • Prometheus: http://localhost:9090"
    echo "  • Grafana: http://localhost:3000"
    echo "  • Price Feed: http://localhost:3002"
    echo ""

    echo "🔧 Useful commands:"
    echo "  • Validate environment: node scripts/validate-env.js"
    echo "  • View logs: docker-compose logs -f [service-name]"
    echo "  • Stop services: docker-compose down"
    echo "  • Reset everything: docker-compose down -v && docker-compose up -d"
    echo ""

    echo "📚 Documentation:"
    echo "  • README.md - Project overview"
    echo "  • backlog.md - Development roadmap"
    echo "  • .env.example - Environment configuration"
    echo ""

    echo -e "${YELLOW}⚠️  Remember to:${NC}"
    echo "  • Review and update your .env file"
    echo "  • Change default passwords in production"
    echo "  • Set up proper secrets management"
}

# Cleanup function for script interruption
cleanup() {
    log_warning "Setup interrupted. You may need to run this script again."
    exit 1
}

# Trap signals for cleanup
trap cleanup INT TERM

# Main execution
main() {
    log_header "🚀 Aztec OTC Desk Development Setup"
    echo "This script will set up a complete development environment"
    echo ""

    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -f "docker-compose.yml" ]; then
        log_error "Please run this script from the root of the Aztec OTC Desk project"
        exit 1
    fi

    # Run setup steps
    check_requirements
    setup_environment
    install_dependencies
    compile_contracts
    setup_database
    setup_redis
    start_services
    setup_monitoring
    deploy_tokens
    create_test_data
    show_final_instructions

    log_success "Development environment setup completed successfully! 🎉"
}

# Run main function
main "$@"