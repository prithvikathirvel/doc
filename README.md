# Document Service

A cloud-agnostic document management system (DMS) backend providing file storage via MinIO, document metadata persistence via MySQL, and a workflow engine for document approval pipelines.

## Prerequisites

| Dependency | Version |
|------------|---------|
| Node.js | >= 18.x |
| npm | >= 9.x |
| MySQL | >= 8.0 |
| MinIO | Latest |
| MongoDB | >= 6.x (optional) |

---

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000

# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=dms

# MinIO
MINIO_IP=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# MongoDB (optional)
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=dms
```

---

## Installation & Setup

### Windows

#### 1. Install Node.js

Download and install from https://nodejs.org/en/download or use winget:

```powershell
winget install OpenJS.NodeJS.LTS
```

#### 2. Install MySQL

Download from https://dev.mysql.com/downloads/installer/ and run the installer.

Or use winget:

```powershell
winget install Oracle.MySQL
```

Create the database:

```powershell
mysql -u root -p -e "CREATE DATABASE dms;"
```

#### 3. Install MinIO

```powershell
Invoke-WebRequest https://dl.min.io/server/minio/release/windows-amd64/minio.exe -OutFile C:\minio\minio.exe
```

Start MinIO:

```powershell
C:\minio\minio.exe server C:\minio\data --console-address ":9001"
```

MinIO will be available at:
- API: http://localhost:9000
- Console: http://localhost:9001 (login with `minioadmin` / `minioadmin`)

#### 4. Clone and Install Dependencies

```powershell
git clone https://vault.sify.net/onesify/dms/backend/document-service.git
cd document-service
npm install
```

#### 5. Run the Application

Development mode (with hot-reload):

```powershell
npm run serve:express-dev
```

Production build:

```powershell
npm run build
npm run serve:express
```

---

### Linux (Ubuntu/Debian)

#### 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```bash
node --version
npm --version
```

#### 2. Install MySQL

```bash
sudo apt update
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql
```

Secure and create database:

```bash
sudo mysql_secure_installation
sudo mysql -e "CREATE DATABASE dms;"
```

#### 3. Install MinIO

```bash
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
sudo mv minio /usr/local/bin/
```

Start MinIO:

```bash
mkdir -p ~/minio-data
minio server ~/minio-data --console-address ":9001"
```

Or run as a systemd service:

```bash
sudo tee /etc/systemd/system/minio.service > /dev/null <<EOF
[Unit]
Description=MinIO Object Storage
After=network.target

[Service]
User=$USER
ExecStart=/usr/local/bin/minio server /data/minio --console-address ":9001"
Restart=always
Environment=MINIO_ROOT_USER=minioadmin
Environment=MINIO_ROOT_PASSWORD=minioadmin

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl start minio
sudo systemctl enable minio
```

#### 4. Clone and Install Dependencies

```bash
git clone https://vault.sify.net/onesify/dms/backend/document-service.git
cd document-service
npm install
```

#### 5. Run the Application

Development mode:

```bash
npm run serve:express-dev
```

Production build:

```bash
npm run build
npm run serve:express
```

---

## Verify Installation

Once the server is running, test connectivity:

```bash
curl http://localhost:3000/api/workflow
```

Expected: `200 OK` with a JSON array (empty if no workflows exist yet).

---

## Swagger API Documentation

This project includes built-in Swagger UI for interactive API documentation and testing.

### Accessing Swagger

After starting the server, open in your browser:

```
http://localhost:3000/api-docs
```

The raw OpenAPI JSON spec is also available at:

```
http://localhost:3000/api-docs.json
```

### Running Swagger Locally (Step by Step)

#### Windows

```powershell
# 1. Make sure dependencies are installed
npm install

# 2. Start the dev server
npm run serve:express-dev

# 3. Open Swagger UI in the default browser
Start-Process "http://localhost:3000/api-docs"
```

#### Linux

```bash
# 1. Make sure dependencies are installed
npm install

# 2. Start the dev server
npm run serve:express-dev

# 3. Open Swagger UI in the browser
xdg-open http://localhost:3000/api-docs
```

### Using Swagger UI

1. Open `http://localhost:3000/api-docs` in your browser
2. You will see all endpoints grouped by tag: **Files**, **Workflows**, **Stages**, **Workflow Instances**, **Handlers**
3. Click any endpoint to expand it and see request/response schemas
4. Click **"Try it out"** to send test requests directly from the browser
5. For authenticated endpoints, click the **"Authorize"** button (lock icon) at the top and enter your JWT token in the `idtoken` field

---

## Available npm Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run serve:express-dev` | Start dev server with nodemon + ts-node |
| `npm run serve:express` | Start production server from compiled `dist/` |
| `npm run dev` | Start with ts-node ESM loader |

---

## Project Structure

```
src/
├── index.ts                  # Express app entry point
├── config/                   # Static configuration
├── controller/express/       # Route handlers
├── dao/
│   ├── minio/                # MinIO file operations
│   ├── mongo/                # MongoDB metadata (optional)
│   ├── mysql/                # MySQL metadata & workflow persistence
│   └── nativeFile/           # Local filesystem storage (unused)
├── dbConnection/             # Database connection setup
├── middleware/               # Auth, error handling
├── route/                    # Express route definitions
├── service/                  # Business logic layer
├── utils/                    # Logger, validators, errors
└── validator/                # Joi request schemas
```

---

## API Endpoints

Base URL: `http://localhost:3000/api`

### Files

| Method | Path | Description |
|--------|------|-------------|
| POST | `/files/upload` | Upload a file |
| GET | `/files/download/*` | Download a file |
| DELETE | `/files/delete-file` | Delete a file |
| DELETE | `/files/delete-directory` | Delete a directory |
| GET | `/files/user/:userName` | Get user directory tree |
| POST | `/files/allFiles` | List all files with filters |
| PUT | `/files/allFiles/:assetId` | Update document metadata |
| POST | `/files/rename` | Rename a file or directory |
| POST | `/files/delete/soft` | Soft-delete a document |
| POST | `/files/restore` | Restore a soft-deleted document |
| GET | `/files/downloadDocument` | Stream download a document |
| GET | `/files/documentDetails/:assetId` | Get document details |

### Workflows

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workflow` | Create a workflow |
| GET | `/workflow` | List all workflows |
| GET | `/workflow/:workflowId` | Get workflow by ID |
| PUT | `/workflow/:workflowId` | Update a workflow |
| PATCH | `/workflow/:workflowId` | Activate/deactivate workflow |

### Stages

| Method | Path | Description |
|--------|------|-------------|
| POST | `/stages` | Create a stage |
| GET | `/stages` | List all stages |
| GET | `/stages/:stageId` | Get stage by ID |
| PUT | `/stages/:stageId` | Update a stage |
| PATCH | `/stages/:stageId` | Activate/deactivate stage |
| DELETE | `/stages/:stageId` | Delete a stage |

### Workflow Instances

| Method | Path | Description |
|--------|------|-------------|
| POST | `/instances` | Create a workflow instance |
| PUT | `/instances/:workflowInstanceId` | Update/transition instance |

### Handlers

| Method | Path | Description |
|--------|------|-------------|
| POST | `/handler` | Execute a handler action |
| GET | `/handler` | List available handlers |
