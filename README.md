# Amigo

Your friendly expense tracker - a modern personal finance app built with Next.js 15, designed for fast expense tracking with smart categorization.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### Core Functionality
- **Quick-Add Expenses** - Natural language input like "25 mcd" auto-parses to "McDonalds - 25.00"
- **Smart Categorization** - Keyword mappings auto-categorize expenses (e.g., "gas" -> Utilities)
- **Expense Types**:
  - **Living (Fixed)** - Recurring fixed costs (rent, subscriptions)
  - **Living (Variable)** - Variable necessities (utilities, groceries)
  - **Lifestyle** - Discretionary spending
  - **Project** - Tagged to specific projects (home renovation, vacation)
- **Monthly Grouping** - Expenses organized by month with totals
- **Excel/CSV Import** - Bulk import from bank statements

### Dashboard
- Monthly/quarterly/yearly views
- Type-based filtering
- Expense statistics (excluding project costs from living totals)
- Quick expense entry

### Management Pages
- **Expenses** - Full CRUD with pagination (25/50/100/All)
- **Categories** - Custom categories for organization
- **Projects** - Track project-specific spending with budgets
- **Bank Accounts** - Multiple account support
- **Keyword Mappings** - Auto-categorization rules

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router + Turbopack) |
| Language | TypeScript 5.7 |
| Database | PostgreSQL (Neon) |
| ORM | Prisma 7 |
| Auth | NextAuth v5 (Auth.js) |
| Styling | Tailwind CSS 4 |
| Runtime | React 19 |

## Getting Started

### Prerequisites
- Node.js 22+ (for development)
- PostgreSQL database (or [Neon](https://neon.tech) account)
- Docker & Docker Compose (for self-hosting)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/slendyzo/amigo.git
   cd amigo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your values:
   ```env
   DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
   AUTH_SECRET="generate-with-openssl-rand-base64-32"
   AUTH_URL="http://localhost:3000"
   ```

4. **Set up database**
   ```bash
   npm run db:migrate
   npm run db:generate
   ```

5. **Run development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

---

## Self-Hosting with Docker

The easiest way to self-host Amigo is with Docker. The image is optimized with multi-stage builds and BuildKit caching for fast rebuilds.

### Quick Start (Docker Compose)

1. **Clone and configure**
   ```bash
   git clone https://github.com/slendyzo/amigo.git
   cd amigo
   cp .env.example .env
   ```

2. **Edit `.env`** with your database and auth settings:
   ```env
   DATABASE_URL="postgresql://user:password@your-db-host/amigo?sslmode=require"
   AUTH_SECRET="your-secret-here"
   AUTH_URL="https://your-domain.com"
   ```

   Generate AUTH_SECRET:
   ```bash
   openssl rand -base64 32
   ```

3. **Build and run**
   ```bash
   # Enable BuildKit for faster builds (recommended)
   export DOCKER_BUILDKIT=1
   export COMPOSE_DOCKER_CLI_BUILD=1

   # Build the image
   docker compose build

   # Start the container
   docker compose up -d
   ```

4. **Access at** `http://localhost:3000` (or your configured domain)

### Manual Docker Build

```bash
# Build the image
docker build -t amigo:latest .

# Run the container
docker run -d \
  --name amigo \
  -p 3000:3000 \
  -e DATABASE_URL="your-connection-string" \
  -e AUTH_SECRET="your-secret" \
  -e AUTH_URL="https://your-domain.com" \
  -e AUTH_TRUST_HOST=true \
  amigo:latest
```

### Updating Your Deployment

```bash
cd amigo
git pull origin main

# Rebuild with BuildKit caching (fast - typically 30-60s)
export DOCKER_BUILDKIT=1
docker compose build

# Restart with minimal downtime (~2-3 seconds)
docker compose up -d --force-recreate --no-build

# Clean up old images
docker image prune -f
```

### Reverse Proxy (Nginx/Caddy)

For production, put Amigo behind a reverse proxy with HTTPS.

**Caddy example** (automatic HTTPS):
```
amigo.yourdomain.com {
    reverse_proxy localhost:3000
}
```

**Nginx example**:
```nginx
server {
    listen 443 ssl http2;
    server_name amigo.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Database Setup

Amigo uses PostgreSQL. You can use:

- **[Neon](https://neon.tech)** - Free tier available, serverless PostgreSQL
- **Local PostgreSQL** - Run your own instance
- **Docker PostgreSQL** - Add to docker-compose.yml:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: amigo
      POSTGRES_PASSWORD: your-password
      POSTGRES_DB: amigo
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  amigo:
    # ... existing amigo config ...
    depends_on:
      - db
    environment:
      - DATABASE_URL=postgresql://amigo:your-password@db:5432/amigo

volumes:
  postgres_data:
```

After starting, run migrations:
```bash
docker compose exec amigo npx prisma migrate deploy
```

### Health Check

The container includes a health check endpoint at `/api/health`. Docker will automatically restart unhealthy containers.

```bash
# Check container health
docker compose ps
curl http://localhost:3000/api/health
```

## Project Structure

```
amigo/
├── src/
│   ├── app/
│   │   ├── api/              # API routes
│   │   │   ├── auth/         # Authentication endpoints
│   │   │   ├── expenses/     # Expense CRUD
│   │   │   ├── categories/   # Category management
│   │   │   ├── projects/     # Project management
│   │   │   ├── bank-accounts/# Bank account management
│   │   │   ├── keyword-mappings/ # Auto-categorization rules
│   │   │   └── import/       # Excel/CSV import
│   │   ├── auth/             # Auth pages (signin, register)
│   │   └── dashboard/        # Dashboard pages
│   │       ├── expenses/     # Expenses list
│   │       ├── categories/   # Categories management
│   │       ├── projects/     # Projects management
│   │       ├── accounts/     # Bank accounts
│   │       ├── mappings/     # Keyword mappings
│   │       └── import/       # Import wizard
│   ├── components/           # React components
│   │   ├── sidebar.tsx       # Navigation sidebar
│   │   ├── add-expense-modal.tsx
│   │   └── edit-expense-modal.tsx
│   └── lib/
│       ├── auth.ts           # NextAuth configuration
│       ├── prisma.ts         # Prisma client
│       └── parser.ts         # Expense name parser
├── prisma/
│   └── schema.prisma         # Database schema
└── public/                   # Static assets
```

## Database Schema

### Core Models

- **User** - Authentication & subscription status
- **Workspace** - Multi-tenancy support (personal/shared)
- **Expense** - Core expense records with currency support
- **Category** - User-defined expense categories
- **Project** - Project-based expense tracking
- **BankAccount** - Multiple account support
- **KeywordMapping** - Smart categorization rules
- **RecurringTemplate** - Recurring expense templates

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/expenses` | List/Create expenses |
| GET/PUT/DELETE | `/api/expenses/[id]` | Single expense operations |
| GET/POST | `/api/categories` | List/Create categories |
| PUT/DELETE | `/api/categories/[id]` | Update/Delete category |
| GET/POST | `/api/projects` | List/Create projects |
| PUT/DELETE | `/api/projects/[id]` | Update/Delete project |
| GET/POST | `/api/bank-accounts` | List/Create accounts |
| PUT/DELETE | `/api/bank-accounts/[id]` | Update/Delete account |
| GET/POST | `/api/keyword-mappings` | List/Create mappings |
| PUT/DELETE | `/api/keyword-mappings/[id]` | Update/Delete mapping |
| POST | `/api/import` | Import from Excel/CSV |
| POST | `/api/import/preview` | Preview import data |

## Scripts

```bash
npm run dev          # Start development server (Turbopack)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:migrate   # Run Prisma migrations
npm run db:studio    # Open Prisma Studio
npm run db:generate  # Generate Prisma client
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `AUTH_SECRET` | NextAuth encryption secret | Yes |
| `AUTH_URL` | Application URL | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | No |

### Generating AUTH_SECRET

```bash
openssl rand -base64 32
```

## Roadmap

- [ ] Shadcn UI component library integration
- [ ] Living Gauge visualization
- [ ] Burn Chart (spending velocity)
- [ ] Recurring expense auto-generation
- [ ] Multi-currency with live exchange rates
- [ ] Mobile app (React Native)
- [ ] AI-powered categorization (Level 2)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Disclaimer

**USE AT YOUR OWN RISK.** This software is provided "as is", without warranty of any kind. The authors and contributors are not responsible for any financial decisions made based on data from this application, any data loss or corruption, any security breaches or unauthorized access, or any direct, indirect, incidental, or consequential damages.

This is personal finance tracking software intended for informational purposes only. It is **not** financial advice, tax advice, or a substitute for professional financial guidance. Always consult qualified professionals for financial decisions.

By using this software, you acknowledge that:
- You are solely responsible for the accuracy of your data
- You use this application at your own risk
- The developers make no guarantees about uptime, data integrity, or security
- This is open-source software maintained by volunteers

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Next.js](https://nextjs.org/) - React framework
- [Prisma](https://prisma.io/) - Database ORM
- [Neon](https://neon.tech/) - Serverless PostgreSQL
- [Auth.js](https://authjs.dev/) - Authentication
- [Tailwind CSS](https://tailwindcss.com/) - Styling
