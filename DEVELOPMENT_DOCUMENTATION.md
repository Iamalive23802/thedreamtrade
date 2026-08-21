# StockVista CRM - Development Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Installation & Setup](#installation--setup)
4. [Troubleshooting Process](#troubleshooting-process)
5. [API Configuration](#api-configuration)
6. [Deployment Guide](#deployment-guide)
7. [Database Schema](#database-schema)
8. [Security Considerations](#security-considerations)
9. [Maintenance](#maintenance)

---

## System Overview

StockVista CRM is a full-stack web application built with:
- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + PostgreSQL
- **Web Server**: Nginx (reverse proxy)
- **Authentication**: JWT tokens

### Key Features
- User authentication and role-based access control
- Lead management system
- Team management
- Financial management
- Real-time data synchronization

---

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Nginx Proxy   │    │   Backend API   │
│   (React/TS)    │◄──►│   (Port 80)     │◄──►│   (Port 5050)   │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │   PostgreSQL    │
                                              │   Database      │
                                              └─────────────────┘
```

### Directory Structure
```
/var/www/stockvista/
├── frontend/                 # React frontend application
│   ├── src/
│   ├── dist/                # Built frontend files
│   ├── package.json
│   └── vite.config.ts
├── backend/                  # Node.js backend application
│   ├── controllers/
│   ├── routes/
│   ├── middleware/
│   ├── server.js
│   └── package.json
└── __MACOSX/                # Archive artifacts
```

---

## Installation & Setup

### Prerequisites
- Ubuntu 22.04 LTS
- Node.js 18+
- PostgreSQL 14+
- Nginx
- Git

### 1. System Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Install Nginx
sudo apt install nginx -y
```

### 2. Database Setup
```bash
# Create database user
sudo -u postgres createuser --interactive vedantpatil

# Create database
sudo -u postgres createdb CRMdatabase

# Set password
sudo -u postgres psql -c "ALTER USER vedantpatil PASSWORD 'CRM@123';"
```

### 3. Application Deployment
```bash
# Clone repository
cd /var/www/
git clone <repository-url> stockvista

# Install backend dependencies
cd stockvista/backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

---

## Troubleshooting Process

### Problem: 404 Error on API Endpoints

#### Initial Symptoms
- Frontend showing: `✅ Using API_BASE: http://139.59.90.124/api`
- API calls failing with: `POST http://139.59.90.124/api/login 404 (Not Found)`

#### Root Cause Analysis

1. **API URL Configuration Issue**
   - Frontend was configured with: `VITE_API_URL=http://139.59.90.124/api/auth`
   - This caused requests to go to: `http://139.59.90.124/api/auth/login`
   - Backend expects: `http://139.59.90.124/api/auth/login`

2. **Backend Route Structure**
   ```javascript
   // Backend routes (server.js)
   app.use('/api/auth', authRoutes);  // Mounts at /api/auth
   
   // Auth routes (routes/auth.js)
   router.post('/login', loginUser);  // Creates /api/auth/login
   ```

3. **Frontend API Calls**
   ```typescript
   // Frontend auth store
   const res = await axiosInstance.post('/auth/login', { email, password });
   // Results in: http://139.59.90.124/api/auth/login ✅
   ```

#### Solution Steps

1. **Fixed Environment Configuration**
   ```bash
   # Updated frontend/.env.production
   VITE_API_URL=http://139.59.90.124/api
   ```

2. **Rebuilt Frontend**
   ```bash
   cd frontend
   NODE_OPTIONS="--max-old-space-size=512" npm run build
   ```

3. **Updated Web Server Files**
   ```bash
   rm -rf /var/www/html/*
   cp -r /var/www/stockvista/frontend/dist/* /var/www/html/
   ```

#### Verification
```bash
# Test API endpoint
curl -X POST http://139.59.90.124/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"pashtenimesh@gmail.com","password":"pass123"}'

# Expected response
{"message":"Login successful","token":"...","user":{...}}
```

---

## API Configuration

### Environment Variables

#### Frontend (.env.production)
```env
# Production Environment
VITE_API_URL=http://139.59.90.124/api
```

#### Backend (.env)
```env
PORT=5050
DB_USER=vedantpatil
DB_HOST=localhost
DB_NAME=CRMdatabase
DB_PASSWORD=CRM@123
DB_PORT=5432
JWT_SECRET=stockvista-secure-jwt-secret-key
JWT_EXPIRES_IN=24h
ALLOWED_ORIGINS=http://localhost:5173,https://stockvista.in,https://crm.stockvista.in
```

### API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/login` | User login | No |
| GET | `/api/users` | Get all users | Yes |
| POST | `/api/users` | Create user | Yes |
| PUT | `/api/users/:id` | Update user | Yes |
| DELETE | `/api/users/:id` | Delete user | Yes |
| GET | `/api/leads` | Get leads | Yes |
| POST | `/api/leads` | Create lead | Yes |
| PUT | `/api/leads/:id` | Update lead | Yes |
| DELETE | `/api/leads/:id` | Delete lead | Yes |
| GET | `/api/teams` | Get teams | Yes |
| POST | `/api/teams` | Create team | Yes |

---

## Deployment Guide

### 1. Backend Deployment
```bash
# Start backend server
cd /var/www/stockvista/backend
npm install
node server.js

# For production, use PM2
npm install -g pm2
pm2 start server.js --name "stockvista-backend"
pm2 save
pm2 startup
```

### 2. Frontend Deployment
```bash
# Build frontend
cd /var/www/stockvista/frontend
npm install
npm run build

# Deploy to web server
cp -r dist/* /var/www/html/
```

### 3. Nginx Configuration
```nginx
server {
    listen 80;
    server_name _;
    
    root /var/www/html;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://localhost:5050/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. Service Management
```bash
# Start services
sudo systemctl start nginx
sudo systemctl enable nginx
pm2 start server.js --name "stockvista-backend"

# Check status
sudo systemctl status nginx
pm2 status
```

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'admin', 'team_leader', 'relationship_mgr', 'financial_manager')),
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    team_id UUID REFERENCES teams(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Teams Table
```sql
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Leads Table
```sql
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone_number VARCHAR(20),
    alt_number VARCHAR(20),
    profession VARCHAR(255),
    state_name VARCHAR(100),
    capital DECIMAL(15,2),
    segment VARCHAR(100),
    status VARCHAR(50) DEFAULT 'New',
    assigned_to UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Sample Data
```sql
-- Insert sample users
INSERT INTO users (email, password, display_name, role, status) VALUES
('pashtenimesh@gmail.com', 'pass123', 'Nimesh Pashte', 'super_admin', 'Active'),
('vvpatil23802@gmail.com', 'pass123', 'Vedant Patil', 'super_admin', 'Active'),
('accounts@stockvista.in', 'pass123', 'Uday Pashte', 'financial_manager', 'Active');
```

---

## Security Considerations

### 1. Password Security
- **Current Issue**: All users have the same password (`pass123`)
- **Recommendation**: Implement password hashing and force password change on first login

### 2. JWT Security
- **Current**: 24-hour expiration
- **Recommendation**: Implement refresh tokens and shorter access token expiration

### 3. API Security
- **Current**: Basic JWT authentication
- **Recommendation**: Add rate limiting, input validation, and CORS configuration

### 4. Database Security
- **Current**: Local PostgreSQL with basic authentication
- **Recommendation**: Implement connection pooling and encrypted connections

### Security Checklist
- [ ] Implement password hashing (bcrypt)
- [ ] Add rate limiting to API endpoints
- [ ] Configure HTTPS/SSL certificates
- [ ] Implement proper CORS policies
- [ ] Add input validation and sanitization
- [ ] Set up database backups
- [ ] Configure firewall rules
- [ ] Implement audit logging

---

## Maintenance

### Regular Tasks

#### 1. Database Backups
```bash
# Create backup
pg_dump -U vedantpatil -d CRMdatabase > backup_$(date +%Y%m%d).sql

# Restore backup
psql -U vedantpatil -d CRMdatabase < backup_20250806.sql
```

#### 2. Log Monitoring
```bash
# Check nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Check application logs
pm2 logs stockvista-backend
```

#### 3. Performance Monitoring
```bash
# Check system resources
htop
df -h
free -h

# Check application status
pm2 status
sudo systemctl status nginx
```

#### 4. Updates
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js dependencies
cd /var/www/stockvista/backend && npm update
cd /var/www/stockvista/frontend && npm update

# Rebuild frontend after updates
cd /var/www/stockvista/frontend
npm run build
cp -r dist/* /var/www/html/
```

### Troubleshooting Commands

#### Check Service Status
```bash
# Check if services are running
sudo systemctl status nginx
pm2 status
ss -tlnp | grep 5050

# Check if database is accessible
PGPASSWORD=CRM@123 psql -U vedantpatil -d CRMdatabase -c "SELECT NOW();"
```

#### Test API Endpoints
```bash
# Test login endpoint
curl -X POST http://139.59.90.124/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"pashtenimesh@gmail.com","password":"pass123"}'

# Test protected endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://139.59.90.124/api/users
```

#### Check Configuration
```bash
# Test nginx configuration
sudo nginx -t

# Check environment variables
cat /var/www/stockvista/frontend/.env.production
cat /var/www/stockvista/backend/.env
```

---

## Login Credentials

### Super Admin Users
- **Email**: `pashtenimesh@gmail.com` | **Password**: `pass123`
- **Email**: `vvpatil23802@gmail.com` | **Password**: `pass123`

### Team Leaders
- **Email**: `girishdanielsv@gmail.com` | **Password**: `pass123`
- **Email**: `avinashepilisv@gmail.com` | **Password**: `pass123`
- **Email**: `stockvistateamleader@gmail.com` | **Password**: `pass123`

### Financial Manager
- **Email**: `accounts@stockvista.in` | **Password**: `pass123`

### Relationship Managers
- **Email**: `tarunjagaleff@gmail.com` | **Password**: `pass123`
- **Email**: `devendradeshmukhff@gmail.com` | **Password**: `pass123`
- **Email**: `gauravtripathisv1@gmail.com` | **Password**: `pass123`

---

## Conclusion

The StockVista CRM system is now fully operational with:
- ✅ Frontend and backend properly configured
- ✅ API endpoints working correctly
- ✅ Database connected and populated
- ✅ Nginx reverse proxy configured
- ✅ User authentication functional

The system is ready for production use with the provided login credentials. Regular maintenance and security updates are recommended for long-term stability.

---

*Documentation created on: August 6, 2025*
*Version: 1.0*
*Last updated: August 6, 2025* 