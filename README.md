# YAFS - Yet Another File Server

A simple Web UI for managing, viewing, and sharing files hosted on your own server.

More info on https://yafs.site

## Tech Stack

- Express.js (backend)
- Nunjucks (templating)
- PostgreSQL with Knex.js (database)
- Multer (file uploads)
- bcrypt (password hashing)

## Installation

### Prerequisites

- Node.js 20+
- PostgreSQL database

### Manual Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Charmunks/yafs.git
   cd yafs
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Configure the environment variables:

5. Run database migrations:
   ```bash
   npm run migrate
   ```

6. Start the server:
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

### Docker Setup

1. Build the image:
   ```bash
   docker build -t yafs .
   ```

2. Run with Docker:
   ```bash
   docker run -d \
     -p 3000:3000 \
     -e DATABASE_URL=postgresql://user:password@host:5432/yafs \
     -e SESSION_SECRET=your-secret-key \
     -e API_TOKEN=your-api-token \
     -e API_USER_ID=1 \
     -v /path/to/uploads:/app/uploads \
     yafs
   ```

### Docker Compose

```yaml
version: '3.8'

services:
  yafs:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://yafs:yafs@db:5432/yafs
      - SESSION_SECRET=change-this-in-production
      - API_TOKEN=your-api-token
      - API_USER_ID=1
    volumes:
      - uploads:/app/uploads
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=yafs
      - POSTGRES_PASSWORD=yafs
      - POSTGRES_DB=yafs
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  uploads:
  pgdata:
```

Run with:
```bash
docker compose up -d
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Secret key for session encryption |
| `API_TOKEN` | Token for programmatic file uploads |
| `API_USER_ID` | User ID associated with API uploads |

