# MeetMind AI

**MeetMind AI** is an intelligent meeting management platform that leverages AI to transcribe, summarize, and extract action items from meetings. The platform helps teams capture meeting insights, track decisions, and follow up on action items automatically.

## Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Running the Application](#-running-the-application)
- [Project Structure](#-project-structure)
- [API Endpoints](#-api-endpoints)
- [Configuration](#-configuration)
- [License](#-license)

## Overview

MeetMind AI provides a complete solution for meeting management with:
- **Audio/Video Recording**: Upload and store meeting recordings
- **AI Transcription**: Convert speech to text using Whisper or similar services
- **Meeting Summaries**: AI-generated summaries of meeting content
- **Action Items Extraction**: Automatic detection of tasks and responsibilities
- **Transcript Management**: Full searchable transcripts with timestamps
- **User Authentication**: Secure JWT-based authentication
- **Real-time Collaboration**: Socket.IO enabled real-time features
## Features

| Feature | Description |
|---------|-------------|
| **User Management** | Register, login, and profile management with JWT authentication |
| **Meeting CRUD** | Create, read, update, and delete meetings |
| **Recording Management** | Upload, store, and retrieve meeting recordings |
| **AI Transcription** | Automatic speech-to-text conversion |
| **Smart Summaries** | AI-powered meeting summaries generation |
| **Action Items** | Extract and track action items from transcripts |
| **Real-time Updates** | Live updates via Socket.IO |
| **Search** | Search through transcripts and summaries |
| **File Upload** | Support for large file uploads (up to 100MB) |

## Tech Stack

### Frontend
- **React** + **Vite** for fast development and HMR
- **React Router** for navigation
- **ESLint** for code quality

### Backend
- **Flask** (Python web framework)
- **Flask-CORS** for Cross-Origin Resource Sharing
- **Flask-SocketIO** for real-time communication
- **SQLAlchemy** ORM with MySQL
- **JWT** for authentication
- **python-dotenv** for environment configuration

### Database
- **MySQL** as the primary database
- SQLAlchemy migrations for schema management

### DevOps
- **Vite** for frontend build and dev server
- **Git** for version control

## Prerequisites

Before installing, ensure you have the following installed:

- **Python** 3.9+
- **Node.js** 18+ (with npm or yarn)
- **MySQL** 8.0+ (or compatible database)
- **Git**

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/meetmind-ai.git
cd meetmind-ai
```

### 2. Backend Setup

```bash
cd backend
python -virtual-env venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in the backend directory:

```
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=your-mysql-password
MYSQL_DB=meetmind
MYSQL_PORT=3306
UPLOAD_FOLDER=uploads
MAX_CONTENT_LENGTH=104857600  # 100MB
```

Initialize the database:

```bash
python init_db.py
python migrate_db.py
```

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Create a `.env` file in the frontend directory (if needed):

```
VITE_API_URL=http://localhost:5000/api
```

### 4. Install Dependencies

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```
## ▶️ Running the Application

### Development Mode

Start the backend server:

```bash
cd backend
python run_server.py
# or simply: python app.py
```

The backend will run on `http://localhost:5000`

Start the frontend development server:

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Production Mode

Build the frontend:

```bash
cd frontend
npm run build
```

Start the backend with production settings:
## 📁 Project Structure

```
meetmind-ai/
├── .gitignore           # Git ignore file
├── .mysql_data/         # MySQL data directory
├── .venv/               # Python virtual environment
├── backend/             # Flask backend application
│   ├── app.py           # Main Flask application
│   ├── config.py        # Configuration settings
│   ├── extensions.py    # SQLAlchemy, JWT, SocketIO init
│   ├── routes/          # API routes
│   │   ├── auth.py      # Authentication routes
│   │   ├── meetings.py  # Meeting routes
│   │   └── recordings.py # Recording routes
│   ├── services/        # Business logic services
│   ├── models/          # SQLAlchemy models
│   ├── utils/           # Utility functions
│   ├── .env             # Environment variables
│   ├── server.log       # Server logs
│   └── server_run.log   # Server run logs
├── database/            # Database schema and migrations
│   └── schema.sql       # Database schema
├── docs/                # Documentation directory
├── frontend/            # React frontend application
│   ├── index.html       # HTML template
│   ├── package.json     # Dependencies
│   ├── vite.config.js   # Vite configuration
│   ├── src/             # Source files
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── api/         # API client functions
│   │   └── App.jsx      # Main App component
│   └── README.md        # Frontend-specific README (Vite template)
├── server.log           # Application log
## 🔌 API Endpoints

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register a new user |
| `/api/auth/login` | POST | Login and get JWT token |
| `/api/auth/me` | GET | Get current user profile |

### Meetings

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/meetings` | GET | Get all meetings |
| `/api/meetings` | POST | Create a new meeting |
| `/api/meetings/<id>` | GET | Get a specific meeting |
| `/api/meetings/<id>` | PUT | Update a meeting |
| `/api/meetings/<id>` | DELETE | Delete a meeting |

### Recordings

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/recordings` | GET | Get all recordings |
| `/api/recordings` | POST | Upload a recording |
| `/api/recordings/<id>` | GET | Get a specific recording |
| `/api/recordings/<id>` | DELETE | Delete a recording |

### Transcripts

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/transcripts/<meetingId>` | GET | Get transcript for a meeting |
| `/api/summaries/<meetingId>` | GET | Get summary for a meeting |
## ⚙️ Configuration

### Environment Variables

#### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Flask session secret key | - |
| `JWT_SECRET_KEY` | JWT token signing key | - |
| `MYSQL_HOST` | MySQL host address | `localhost` |
| `MYSQL_USER` | MySQL username | `root` |
| `MYSQL_PASSWORD` | MySQL password | - |
| `MYSQL_DB` | Database name | `meetmind` |
| `MYSQL_PORT` | MySQL port | `3306` |
| `UPLOAD_FOLDER` | Directory for uploaded files | `uploads` |
| `MAX_CONTENT_LENGTH` | Maximum upload size in bytes | `104857600` (100MB) |

#### Frontend (`frontend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:5000/api` |

### Database Schema

The application uses SQLAlchemy models for the following entities:
- `User` - User accounts and authentication
- `Meeting` - Meeting records and metadata
- `Recording` - Uploaded meeting recordings
- `Transcript` - AI-generated transcripts
- `MeetingSummary` - AI-generated summaries
- `ActionItem` - Extracted action items

Run migrations:
## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Flask community for the excellent web framework
- Vite team for the fast build tool
- MySQL for reliable data storage
- OpenAI/Whisper for speech recognition capabilities

---

**MeetMind AI** - Making meetings more productive through intelligent automation.

```bash
cd backend
python migrate_db.py
```

### Action Items

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/action-items` | GET | Get all action items |
| `/api/action-items` | POST | Create a new action item |
└── README.md            # **This file** - Root project README
```

```bash
cd backend
python run_server.py
```