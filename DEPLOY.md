# Amigo Deployment Guide

Complete guide to deploy Amigo on Proxmox with auto-deploy from GitHub.

---

## Part 1: Create the Server (Proxmox LXC)

### Step 1.1: Download a Container Template

1. Open Proxmox web UI (usually `https://your-proxmox-ip:8006`)
2. Click on your storage (e.g., `local`) in the left sidebar
3. Click **CT Templates** tab
4. Click **Templates** button
5. Search for `debian-12` or `ubuntu-24`
6. Click **Download**

### Step 1.2: Create the Container

1. Click **Create CT** button (top right)
2. Fill in:
   - **CT ID**: Pick a number (e.g., `100`)
   - **Hostname**: `amigo`
   - **Password**: Set a root password (save this!)
   - **SSH public key**: (optional, we'll set this up later)
3. Click **Next**

4. **Template**: Select the Debian/Ubuntu template you downloaded
5. Click **Next**

6. **Disks**:
   - **Disk size**: `8` GB is enough
7. Click **Next**

8. **CPU**:
   - **Cores**: `2`
9. Click **Next**

10. **Memory**:
    - **Memory**: `1024` MB (1GB)
    - **Swap**: `512` MB
11. Click **Next**

12. **Network**:
    - **IPv4**: `DHCP` or set a static IP (recommended)
    - If static: e.g., `192.168.1.50/24`, Gateway: `192.168.1.1`
13. Click **Next**

14. **DNS**: Leave defaults or set your DNS
15. Click **Next** → **Finish**

### Step 1.3: Start and Access the Container

1. Select your new container in the left sidebar
2. Click **Start**
3. Click **Console** to open a terminal
4. Login with `root` and the password you set

---

## Part 2: Install Docker

Run these commands in the container console:

```bash
# Update system
apt update && apt upgrade -y

# Install dependencies
apt install -y ca-certificates curl gnupg git

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository (for Debian - adjust if using Ubuntu)
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify Docker works
docker --version
docker compose version
```

---

## Part 3: Clone and Configure Amigo

### Step 3.1: Clone the Repository

```bash
cd ~
git clone https://github.com/slendyzo/amigo.git
cd amigo
```

### Step 3.2: Create Environment File

```bash
cp .env.example .env
nano .env
```

Edit the file with these values:

```env
# Self-hosted Postgres (docker-compose service named "db")
DATABASE_URL="postgresql://amigo:YOUR_DB_PASSWORD@db:5432/amigo"

# Postgres password used by the docker-compose db service
POSTGRES_PASSWORD="generate-with-openssl-rand-base64-24"

# Generate a random secret (run this command and paste the output):
# openssl rand -base64 32
AUTH_SECRET="paste-your-generated-secret-here"

# Your server's URL (use IP for now, domain later)
AUTH_URL="http://192.168.1.50:3000"
```

To generate AUTH_SECRET, run:
```bash
openssl rand -base64 32
```

Save the file: `Ctrl+O`, `Enter`, `Ctrl+X`

### Step 3.3: First Deploy

```bash
docker compose up -d --build
```

This will take 2-5 minutes on first build. Watch progress with:
```bash
docker compose logs -f
```

Press `Ctrl+C` to stop watching logs.

### Step 3.4: Verify It's Running

```bash
# Check container status
docker compose ps

# Should show: amigo running, healthy

# Test the app
curl http://localhost:3000/api/health
# Should return: {"status":"ok",...}
```

Open in browser: `http://YOUR_SERVER_IP:3000`

---

## Part 4: Set Up Auto-Deploy from GitHub

### Step 4.1: Generate SSH Key for GitHub

On your Proxmox container:

```bash
# Generate a new SSH key (press Enter for all prompts)
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""

# Show the public key (we'll add this to authorized_keys)
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys

# Show the private key (you'll need to copy this)
cat ~/.ssh/github_deploy
```

**Copy the entire private key output** (from `-----BEGIN OPENSSH PRIVATE KEY-----` to `-----END OPENSSH PRIVATE KEY-----`)

### Step 4.2: Add Secrets to GitHub

1. Go to: `https://github.com/slendyzo/amigo/settings/secrets/actions`
2. Click **New repository secret** for each:

| Name | Value |
|------|-------|
| `SERVER_HOST` | Your server IP (e.g., `192.168.1.50`) |
| `SERVER_USER` | `root` |
| `SERVER_SSH_KEY` | Paste the entire private key from Step 4.1 |
| `SERVER_PORT` | `22` (or your custom SSH port) |

### Step 4.3: Test the Auto-Deploy

Make any small change to your code and push:

```bash
# On your development machine
git add .
git commit -m "Test auto-deploy"
git push
```

Then go to: `https://github.com/slendyzo/amigo/actions`

You should see a workflow running. Once it's green, your server has the latest code!

---

## Part 5: Set Up a Domain (Optional but Recommended)

### Option A: Use Cloudflare Tunnel (Easiest, Free HTTPS)

1. Create a free Cloudflare account
2. Add your domain to Cloudflare
3. Install cloudflared on your server:

```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb

# Login to Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create amigo

# Configure tunnel
cat > ~/.cloudflared/config.yml << EOF
tunnel: amigo
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: finance.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
EOF

# Route DNS
cloudflared tunnel route dns amigo finance.yourdomain.com

# Run as service
cloudflared service install
systemctl start cloudflared
```

4. Update your `.env`:
```bash
nano ~/amigo/.env
# Change AUTH_URL to:
AUTH_URL="https://finance.yourdomain.com"
```

5. Rebuild:
```bash
cd ~/amigo
docker compose down
docker compose up -d --build
```

### Option B: Use Nginx + Let's Encrypt

```bash
# Install Nginx and Certbot
apt install -y nginx certbot python3-certbot-nginx

# Create Nginx config
cat > /etc/nginx/sites-available/amigo << 'EOF'
server {
    listen 80;
    server_name finance.yourdomain.com;

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
EOF

# Enable site
ln -s /etc/nginx/sites-available/amigo /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Get SSL certificate (make sure your domain points to this server first!)
certbot --nginx -d finance.yourdomain.com
```

---

## Part 6: Useful Commands

### Check Status
```bash
cd ~/amigo
docker compose ps
docker compose logs -f  # Follow logs (Ctrl+C to stop)
```

### Manual Update
```bash
cd ~/amigo
git pull
docker compose down
docker compose up -d --build
```

### Restart App
```bash
cd ~/amigo
docker compose restart
```

### View Resource Usage
```bash
docker stats amigo
```

### Clean Up Old Images
```bash
docker image prune -f
docker system prune -f  # More aggressive cleanup
```

---

## Troubleshooting

### Container won't start
```bash
docker compose logs
# Look for error messages
```

### Database connection failed
- Check your `DATABASE_URL` in `.env`
- Make sure the `db` service is running: `docker compose ps`
- Test connection: `docker compose exec amigo node -e "console.log('test')"`

### SSH deploy fails
- Verify secrets are set correctly in GitHub
- Test SSH manually: `ssh -i ~/.ssh/github_deploy root@YOUR_IP`
- Check SSH is enabled: `systemctl status ssh`

### Port 3000 not accessible
- Check firewall: `ufw status` (if using ufw)
- Check container is running: `docker compose ps`
- Check from inside: `curl localhost:3000/api/health`

---

## Quick Reference

| What | Command |
|------|---------|
| Start app | `docker compose up -d` |
| Stop app | `docker compose down` |
| View logs | `docker compose logs -f` |
| Rebuild | `docker compose up -d --build` |
| Update | `git pull && docker compose up -d --build` |
| Check status | `docker compose ps` |

| URL | Purpose |
|-----|---------|
| `http://SERVER_IP:3000` | Main app |
| `http://SERVER_IP:3000/api/health` | Health check |
| GitHub Actions | Auto-deploy status |
