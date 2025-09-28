#!/usr/bin/env node

/**
 * Environment Validation Script for Aztec OTC Desk
 * Validates required environment variables and their formats
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Environment variable validation rules
const validationRules = {
  // Required variables
  required: [
    'NODE_ENV',
    'L2_NODE_URL',
    'API_HMAC_SECRET',
    'DATABASE_URL'
  ],

  // Conditional requirements (required in production)
  productionRequired: [
    'JWT_SECRET',
    'SESSION_SECRET',
    'CORS_ORIGINS'
  ],

  // Format validations
  format: {
    NODE_ENV: {
      pattern: /^(development|staging|production|test)$/,
      message: 'Must be one of: development, staging, production, test'
    },
    L2_NODE_URL: {
      pattern: /^https?:\/\/.+/,
      message: 'Must be a valid HTTP/HTTPS URL'
    },
    PXE_URL: {
      pattern: /^https?:\/\/.+/,
      message: 'Must be a valid HTTP/HTTPS URL'
    },
    DATABASE_URL: {
      pattern: /^(postgresql|sqlite):\/\/.+/,
      message: 'Must be a valid PostgreSQL or SQLite URL'
    },
    REDIS_URL: {
      pattern: /^redis:\/\/.+/,
      message: 'Must be a valid Redis URL'
    },
    API_HMAC_SECRET: {
      minLength: 32,
      message: 'Must be at least 32 characters long for security'
    },
    JWT_SECRET: {
      minLength: 32,
      message: 'Must be at least 32 characters long for security'
    },
    SESSION_SECRET: {
      minLength: 32,
      message: 'Must be at least 32 characters long for security'
    },
    CORS_ORIGINS: {
      pattern: /^https?:\/\/.+(,https?:\/\/.+)*$/,
      message: 'Must be comma-separated valid HTTP/HTTPS URLs'
    },
    PORT: {
      pattern: /^\d+$/,
      message: 'Must be a valid port number'
    },
    RATE_LIMIT_MAX_REQUESTS: {
      pattern: /^\d+$/,
      message: 'Must be a positive integer'
    },
    RATE_LIMIT_WINDOW_MS: {
      pattern: /^\d+$/,
      message: 'Must be a positive integer (milliseconds)'
    }
  },

  // Security validations
  security: {
    insecurePatterns: [
      {
        pattern: /password|secret|key/i,
        values: ['password', 'secret', 'key', 'admin', 'test', 'dev', 'default'],
        message: 'Appears to contain default/insecure values'
      }
    ]
  }
};

class EnvironmentValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  log(level, message, details = '') {
    const timestamp = new Date().toISOString();
    const coloredLevel = {
      ERROR: `${colors.red}${colors.bold}ERROR${colors.reset}`,
      WARN: `${colors.yellow}${colors.bold}WARN${colors.reset}`,
      INFO: `${colors.blue}${colors.bold}INFO${colors.reset}`,
      SUCCESS: `${colors.green}${colors.bold}SUCCESS${colors.reset}`
    }[level] || level;

    console.log(`[${timestamp}] ${coloredLevel}: ${message}${details ? ' - ' + details : ''}`);
  }

  validateRequired() {
    this.log('INFO', 'Validating required environment variables...');

    for (const varName of validationRules.required) {
      const value = process.env[varName];
      if (!value) {
        this.errors.push(`Missing required environment variable: ${varName}`);
      } else {
        this.info.push(`✓ ${varName} is present`);
      }
    }

    // Check production-specific requirements
    if (process.env.NODE_ENV === 'production') {
      for (const varName of validationRules.productionRequired) {
        const value = process.env[varName];
        if (!value) {
          this.errors.push(`Missing production-required environment variable: ${varName}`);
        } else {
          this.info.push(`✓ ${varName} is present (production)`);
        }
      }
    }
  }

  validateFormats() {
    this.log('INFO', 'Validating environment variable formats...');

    for (const [varName, rules] of Object.entries(validationRules.format)) {
      const value = process.env[varName];
      if (!value) continue; // Skip if not set (required check handles this)

      // Pattern validation
      if (rules.pattern && !rules.pattern.test(value)) {
        this.errors.push(`Invalid format for ${varName}: ${rules.message}`);
        continue;
      }

      // Length validation
      if (rules.minLength && value.length < rules.minLength) {
        this.errors.push(`${varName} is too short: ${rules.message}`);
        continue;
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        this.warnings.push(`${varName} is very long: consider shortening`);
      }

      this.info.push(`✓ ${varName} format is valid`);
    }
  }

  validateSecurity() {
    this.log('INFO', 'Performing security validation...');

    for (const [varName, value] of Object.entries(process.env)) {
      if (!value) continue;

      // Check for insecure patterns
      for (const check of validationRules.security.insecurePatterns) {
        if (check.pattern.test(varName)) {
          for (const insecureValue of check.values) {
            if (value.toLowerCase().includes(insecureValue.toLowerCase())) {
              this.warnings.push(`${varName} ${check.message}: contains '${insecureValue}'`);
            }
          }
        }
      }

      // Check for exposed secrets in logs
      if (/secret|key|password|token/i.test(varName)) {
        if (value.length < 16) {
          this.warnings.push(`${varName} appears to be a secret but is very short`);
        }
      }
    }

    // Environment-specific security checks
    if (process.env.NODE_ENV === 'production') {
      // Check for development values in production
      const devPatterns = ['localhost', '127.0.0.1', 'dev', 'test', 'demo'];
      for (const [varName, value] of Object.entries(process.env)) {
        if (devPatterns.some(pattern => value.toLowerCase().includes(pattern))) {
          this.warnings.push(`${varName} contains development-like value in production: ${value.substring(0, 20)}...`);
        }
      }
    }
  }

  validateConnectivity() {
    this.log('INFO', 'Checking service connectivity (basic URL validation)...');

    const urlVars = ['L2_NODE_URL', 'PXE_URL', 'DATABASE_URL', 'REDIS_URL', 'PROMETHEUS_URL', 'GRAFANA_URL'];

    for (const varName of urlVars) {
      const value = process.env[varName];
      if (!value) continue;

      try {
        const url = new URL(value);
        this.info.push(`✓ ${varName} is a valid URL: ${url.protocol}//${url.host}`);

        // Additional checks for specific services
        if (varName === 'DATABASE_URL') {
          if (url.protocol === 'sqlite:') {
            const dbPath = url.pathname;
            // In a real environment, you might check if the SQLite file directory exists
            this.info.push(`✓ SQLite database path: ${dbPath}`);
          } else if (url.protocol === 'postgresql:') {
            if (!url.hostname || !url.port || !url.pathname) {
              this.warnings.push(`${varName} missing hostname, port, or database name`);
            }
          }
        }
      } catch (error) {
        this.errors.push(`${varName} is not a valid URL: ${error.message}`);
      }
    }
  }

  validateTokenAddresses() {
    this.log('INFO', 'Validating token addresses...');

    const tokenVars = ['NEXT_PUBLIC_ETH_ADDRESS', 'NEXT_PUBLIC_USDC_ADDRESS'];

    for (const varName of tokenVars) {
      const value = process.env[varName];
      if (!value) continue;

      // Basic Aztec address validation (64 hex characters with 0x prefix)
      if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
        this.errors.push(`${varName} is not a valid Aztec address format (should be 0x + 64 hex chars)`);
      } else {
        this.info.push(`✓ ${varName} has valid address format`);
      }
    }
  }

  checkEnvFile() {
    const envPath = path.join(process.cwd(), '.env');
    const envExamplePath = path.join(process.cwd(), '.env.example');

    if (!fs.existsSync(envPath)) {
      this.warnings.push('.env file not found - using system environment variables only');
    } else {
      this.info.push('✓ .env file found');
    }

    if (fs.existsSync(envExamplePath)) {
      this.info.push('✓ .env.example file found');
    }
  }

  run() {
    this.log('INFO', `${colors.cyan}${colors.bold}Starting Aztec OTC Desk Environment Validation${colors.reset}`);
    this.log('INFO', `Environment: ${process.env.NODE_ENV || 'undefined'}`);

    this.checkEnvFile();
    this.validateRequired();
    this.validateFormats();
    this.validateSecurity();
    this.validateConnectivity();
    this.validateTokenAddresses();

    // Report results
    console.log('\n' + '='.repeat(60));
    this.log('INFO', `${colors.cyan}${colors.bold}Validation Results${colors.reset}`);
    console.log('='.repeat(60));

    if (this.errors.length > 0) {
      this.log('ERROR', `Found ${this.errors.length} error(s):`);
      this.errors.forEach(error => console.log(`  ${colors.red}✗${colors.reset} ${error}`));
    }

    if (this.warnings.length > 0) {
      this.log('WARN', `Found ${this.warnings.length} warning(s):`);
      this.warnings.forEach(warning => console.log(`  ${colors.yellow}⚠${colors.reset} ${warning}`));
    }

    if (this.info.length > 0) {
      this.log('SUCCESS', `${this.info.length} validation(s) passed:`);
      this.info.forEach(info => console.log(`  ${colors.green}✓${colors.reset} ${info}`));
    }

    console.log('='.repeat(60));

    if (this.errors.length === 0) {
      this.log('SUCCESS', `${colors.green}${colors.bold}Environment validation completed successfully!${colors.reset}`);
      return true;
    } else {
      this.log('ERROR', `${colors.red}${colors.bold}Environment validation failed with ${this.errors.length} error(s)${colors.reset}`);
      this.log('INFO', 'Please fix the errors above before starting the application');
      return false;
    }
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  // Load .env file if it exists
  try {
    require('dotenv').config();
  } catch (error) {
    console.log('Note: dotenv not available, using system environment variables only');
  }

  const validator = new EnvironmentValidator();
  const isValid = validator.run();

  process.exit(isValid ? 0 : 1);
}

module.exports = EnvironmentValidator;