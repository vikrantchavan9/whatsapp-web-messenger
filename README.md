# WhatsApp Web Messenger

A full-stack WhatsApp messaging application built with NestJS and Next.js, leveraging the WhatsApp Web API to provide a seamless messaging experience through a custom web interface.

## 🚀 Features

- **WhatsApp Web Integration**: Connect to WhatsApp using QR code authentication
- **Real-time Messaging**: Send and receive messages in real-time via Socket.IO
- **User Registration**: Custom user registration flow with phone number validation
- **Media Support**: Upload and send media files through WhatsApp
- **PostgreSQL Database**: Store user data and message history
- **Docker Support**: Complete containerized setup for easy deployment
- **Modern UI**: Built with Next.js 16, React 19, and TailwindCSS 4

## 📋 Tech Stack

### Backend
- **NestJS** - Progressive Node.js framework
- **whatsapp-web.js** - WhatsApp Web API client
- **Socket.IO** - Real-time bidirectional communication
- **PostgreSQL** - Database for user and message storage
- **Puppeteer** - Headless browser for WhatsApp session management
- **TypeScript** - Type-safe development

### Frontend
- **Next.js 16** - React framework with App Router
- **React 19** - Latest React with React Compiler
- **TailwindCSS 4** - Utility-first CSS framework
- **shadcn/ui** - High-quality UI components
- **Socket.IO Client** - Real-time updates
- **TypeScript** - Type-safe development

## 🛠️ Prerequisites

- **Node.js** (v18 or higher)
- **Docker & Docker Compose** (for containerized setup)
- **PostgreSQL** (if running without Docker)
- **npm or yarn** (package manager)

## 📦 Installation

### Option 1: Docker Setup (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd whatsapp-web-messenger
   ```

2. **Set up environment variables**
   
   Create `.env` file in the root directory:
   ```env
   BACKEND_ENV_FILE=./backend/.env
   FRONTEND_ENV_FILE=./frontend/.env.local
   ```

   Create `backend/.env`:
   ```env
   DATABASE_HOST=your_database_host
   DATABASE_PORT=5432
   DATABASE_USER=your_database_user
   DATABASE_PASSWORD=your_database_password
   DATABASE_NAME=whatsapp_db
   PORT=3001
   SOCKET_PORT=5000
   ```

   Create `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
   ```

3. **Start the application**
   ```bash
   docker-compose up -d
   ```

4. **Access the services**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Socket.IO: http://localhost:5000
   - pgAdmin: http://localhost:5050 (Email: pgadmin@email.com, Password: PASSWORD)

### Option 2: Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd whatsapp-web-messenger
   ```

2. **Set up Backend**
   ```bash
   cd backend
   npm install

    // Update Dependencies
   sudo apt-get update

    // Install Chrome headless
   sudo snap install chromium

    // Install Dependencies for whatsapp-web.js
    sudo apt-get install -y \
    libatk1.0-0t64 \
    libatk-bridge2.0-0t64 \
    libcups2t64 \
    libatspi2.0-0t64 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2t64
   
   # Create .env file with database credentials
   # (see backend/.env example above)
   
   npm run start:dev
   ```

3. **Set up Frontend**
   ```bash
   cd frontend
   npm install
   
   # Create .env.local file
   # (see frontend/.env.local example above)
   
   npm run dev
   ```

## 🎯 Usage

### Initial Setup

1. **Access the application** at http://localhost:3000
2. **Scan the QR code** displayed on the screen with your WhatsApp mobile app
3. **Register** by providing your phone number and name
4. **Start messaging** through the web interface

### User Registration Flow

1. User enters their phone number
2. System sends a registration prompt to WhatsApp
3. User responds to WhatsApp message with their name
4. System validates and stores user information
5. User can now send and receive messages

## 🏗️ Project Structure

```
whatsapp-web-messenger/
├── backend/                  # NestJS backend application
│   ├── src/
│   │   ├── app.module.ts    # Main application module
│   │   ├── main.ts          # Application entry point
│   │   ├── postgres.service.ts       # PostgreSQL service
│   │   ├── whatsapp.controller.ts    # WhatsApp REST endpoints
│   │   └── whatsapp.service.ts       # WhatsApp business logic
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                 # Next.js frontend application
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   ├── components/      # React components
│   │   ├── lib/             # Utility functions
│   │   └── types/           # TypeScript type definitions
│   ├── public/              # Static assets
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml       # Docker orchestration
└── .env                     # Environment configuration
```

## 🔌 API Endpoints

### REST API (Port 3001)

- `POST /whatsapp/register` - Register a new user
- `POST /whatsapp/send` - Send a message
- `POST /whatsapp/upload` - Upload and send media
- `GET /whatsapp/qr` - Get WhatsApp QR code for authentication

### Socket.IO Events (Port 5000)

- `qr` - QR code generated for WhatsApp authentication
- `ready` - WhatsApp client is ready
- `message` - New message received
- `authenticated` - WhatsApp client authenticated

## 🗄️ Database Schema

The application uses PostgreSQL to store:
- User information (phone numbers, names, country codes)
- Message history
- Session data

## 🚧 Development

### Backend Development

```bash
cd backend
npm run start:dev    # Start with hot-reload
npm run build        # Build for production
npm run start:prod   # Run production build
```

### Frontend Development

```bash
cd frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
```

## 🐳 Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Remove volumes (clean database)
docker-compose down -v
```

## 📝 Environment Variables

### Backend (.env)
| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_HOST | PostgreSQL host | - |
| DATABASE_PORT | PostgreSQL port | 5432 |
| DATABASE_USER | Database username | - |
| DATABASE_PASSWORD | Database password | - |
| DATABASE_NAME | Database name | - |
| PORT | Backend API port | 3001 |
| SOCKET_PORT | Socket.IO port | 5000 |

### Frontend (.env.local)
| Variable | Description | Default |
|----------|-------------|---------|
| NEXT_PUBLIC_API_URL | Backend API URL | http://localhost:3001 |
| NEXT_PUBLIC_SOCKET_URL | Socket.IO URL | http://localhost:5000 |

## 🔒 Security Notes

- WhatsApp session data is stored securely
- Environment variables should never be committed to version control
- Use strong database passwords in production
- Configure CORS appropriately for production deployment
- Consider implementing rate limiting for API endpoints

## 🛠️ Troubleshooting

### WhatsApp Client Issues
- **QR Code not generating**: Ensure Puppeteer dependencies are installed
- **Session expired**: Delete the `.wwebjs_auth` directory and re-authenticate
- **LocalAuth compatibility error**: Check userDataDir configuration in Docker

### Database Connection
- Verify PostgreSQL is running: `docker ps`
- Check database credentials in environment files
- Ensure database exists: `psql -U postgres -c "CREATE DATABASE whatsapp_db;"`

### Port Conflicts
- Check if ports 3000, 3001, or 5000 are already in use
- Modify port mappings in `docker-compose.yml` if needed

## 🙏 Acknowledgments

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - WhatsApp Web API client
- [NestJS](https://nestjs.com/) - Backend framework
- [Next.js](https://nextjs.org/) - Frontend framework
- [shadcn/ui](https://ui.shadcn.com/) - UI component library

## 📞 Support

For issues and questions, please open an issue on the GitHub repository.
