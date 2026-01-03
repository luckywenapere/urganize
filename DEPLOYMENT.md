# 🚀 DEPLOYMENT GUIDE

## Overview

This guide covers deploying the Urganize MVP to production. The app is a static Next.js application that can be deployed to any hosting platform that supports Node.js.

---

## Prerequisites

- Git repository with your code
- Node.js 18+ installed
- npm or yarn package manager
- Account on chosen hosting platform

---

## Deployment Options

### Option 1: Vercel (Recommended - Easiest)

Vercel is the creator of Next.js and provides the best integration.

#### Steps:

1. **Push code to GitHub**:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

2. **Deploy to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Connect your GitHub account
   - Select your repository
   - Vercel auto-detects Next.js
   - Click "Deploy"

3. **Configure** (if needed):
   - Project name: `urganize-mvp`
   - Framework: Next.js (auto-detected)
   - Root directory: `./`
   - Build command: `npm run build`
   - Output directory: `.next`

4. **Done!**
   - Your app is live at: `https://your-project.vercel.app`
   - Every git push auto-deploys

#### Custom Domain (Optional):
- Go to project settings → Domains
- Add your domain
- Configure DNS records as shown
- SSL certificate auto-generated

---

### Option 2: Netlify

Good alternative with similar features.

#### Steps:

1. **Build the app**:
```bash
npm run build
```

2. **Deploy to Netlify**:
   - Go to [netlify.com](https://netlify.com)
   - Drag and drop the `.next` folder
   - Or connect GitHub repository

3. **Configure**:
```bash
# netlify.toml (create this file)
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "18"
```

4. **Custom Domain**:
   - Site settings → Domain management
   - Add custom domain
   - Configure DNS

---

### Option 3: Railway

Simple, affordable, good for full-stack apps (when you add backend).

#### Steps:

1. **Install Railway CLI**:
```bash
npm install -g @railway/cli
```

2. **Login**:
```bash
railway login
```

3. **Initialize**:
```bash
railway init
```

4. **Deploy**:
```bash
railway up
```

5. **Get URL**:
```bash
railway domain
```

---

### Option 4: Self-Hosted (VPS)

For full control. Requires more setup.

#### Requirements:
- VPS (DigitalOcean, Linode, AWS EC2, etc.)
- Ubuntu 22.04+ recommended
- Domain name (optional)

#### Steps:

1. **SSH into VPS**:
```bash
ssh root@YOUR_SERVER_IP
```

2. **Install Node.js**:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Install PM2** (process manager):
```bash
npm install -g pm2
```

4. **Upload code**:
```bash
# On your machine
scp -r ./urganize-mvp root@YOUR_SERVER_IP:/var/www/
```

5. **Install dependencies**:
```bash
cd /var/www/urganize-mvp
npm install
npm run build
```

6. **Start with PM2**:
```bash
pm2 start npm --name "urganize" -- start
pm2 save
pm2 startup
```

7. **Configure Nginx** (optional, for domain):
```bash
sudo apt install nginx

# Create config
sudo nano /etc/nginx/sites-available/urganize

# Add:
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/urganize /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

8. **Add SSL** (optional):
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Environment Variables

Currently, the MVP doesn't require environment variables. For future backend:

### Vercel/Netlify:
- Go to project settings
- Add environment variables
- Redeploy

### Railway:
```bash
railway variables set KEY=value
```

### Self-hosted:
```bash
# Create .env file
nano /var/www/urganize-mvp/.env

# Add variables
NEXT_PUBLIC_APP_URL=https://your-domain.com
# etc.
```

---

## Post-Deployment Checklist

### Immediate:
- [ ] Test all pages load
- [ ] Test signup/login
- [ ] Test create release
- [ ] Test file upload
- [ ] Test on mobile
- [ ] Test on different browsers

### Within 24 Hours:
- [ ] Set up error monitoring (Sentry)
- [ ] Set up analytics (Google Analytics)
- [ ] Configure custom domain
- [ ] Add SSL certificate
- [ ] Test performance (PageSpeed Insights)

### Within 1 Week:
- [ ] Set up backup strategy
- [ ] Configure CDN (Cloudflare)
- [ ] Add monitoring (UptimeRobot)
- [ ] Set up alerts (email/Slack)
- [ ] Document deployment process

---

## Monitoring & Analytics

### Error Tracking (Recommended: Sentry)

1. **Install**:
```bash
npm install @sentry/nextjs
```

2. **Configure**:
```javascript
// sentry.client.config.js
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  tracesSampleRate: 1.0,
});
```

### Analytics (Recommended: Google Analytics)

1. **Get GA4 ID** from Google Analytics

2. **Add to layout.tsx**:
```typescript
<Script
  src={`https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX`}
  strategy="afterInteractive"
/>
<Script id="google-analytics" strategy="afterInteractive">
  {`
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXXXXX');
  `}
</Script>
```

### Uptime Monitoring (Recommended: UptimeRobot)

- Free tier: Check every 5 minutes
- Set up at [uptimerobot.com](https://uptimerobot.com)
- Add your production URL
- Configure alerts (email/Slack)

---

## Performance Optimization

### Before Deploying:

1. **Optimize images**:
```bash
# Use Next.js Image component
import Image from 'next/image'

<Image
  src="/image.png"
  width={500}
  height={300}
  alt="Description"
/>
```

2. **Enable compression**:
```javascript
// next.config.js
module.exports = {
  compress: true,
}
```

3. **Add caching headers**:
```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}
```

### After Deploying:

- Run [PageSpeed Insights](https://pagespeed.web.dev/)
- Aim for 90+ score
- Fix any issues identified

---

## Troubleshooting

### Build Fails

**Error**: "Module not found"
```bash
# Solution: Clear cache and reinstall
rm -rf node_modules .next
npm install
npm run build
```

**Error**: TypeScript errors
```bash
# Solution: Fix type errors or temporarily disable strict mode
# tsconfig.json
{
  "compilerOptions": {
    "strict": false  // Not recommended for production
  }
}
```

### App Crashes

1. **Check logs**:
   - Vercel: Dashboard → Logs
   - Railway: Dashboard → Deployments → Logs
   - Self-hosted: `pm2 logs urganize`

2. **Common issues**:
   - Missing dependencies: `npm install`
   - Wrong Node version: Update to 18+
   - Port conflicts: Change port in `package.json`

### Slow Performance

1. **Enable Next.js telemetry**:
```bash
npx next telemetry enable
```

2. **Analyze bundle**:
```bash
npm install @next/bundle-analyzer

# next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({})

# Run
ANALYZE=true npm run build
```

3. **Fix large bundles**:
   - Code-split components
   - Lazy load routes
   - Optimize images

---

## Security

### Pre-Launch:

- [ ] Remove console.logs
- [ ] Check for hardcoded secrets
- [ ] Enable HTTPS only
- [ ] Add security headers
- [ ] Configure CORS
- [ ] Rate limit API routes (when added)

### Security Headers:

```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      }
    ]
  }
}
```

---

## Rollback Strategy

### Vercel:
1. Go to project → Deployments
2. Find previous deployment
3. Click "..." → Promote to Production

### Railway:
```bash
railway rollback
```

### Self-hosted:
```bash
# Keep backups of builds
cd /var/www/urganize-mvp
cp -r .next .next-backup-$(date +%Y%m%d)

# To rollback
rm -rf .next
cp -r .next-backup-YYYYMMDD .next
pm2 restart urganize
```

---

## Cost Estimates

### Free Tier (Good for MVP):
- **Vercel**: Free (hobby plan)
  - Includes: SSL, CDN, analytics
  - Limits: 100GB bandwidth/month

- **Netlify**: Free (starter)
  - Includes: SSL, CDN, forms
  - Limits: 100GB bandwidth/month

### Paid Plans (For Scale):
- **Vercel Pro**: $20/month
  - Unlimited bandwidth
  - Team collaboration
  - Priority support

- **Railway**: $5/month (starts when you add backend)
  - $0.000231/GB RAM/minute
  - $0.000463/vCPU/minute

- **VPS**: $5-20/month
  - DigitalOcean: $5/month (1GB RAM)
  - Linode: $5/month (1GB RAM)
  - AWS Lightsail: $3.50/month (512MB RAM)

---

## Next Steps After Deployment

1. **Share URL** with beta testers
2. **Monitor** for 24-48 hours
3. **Collect feedback**
4. **Fix critical bugs**
5. **Plan backend** integration
6. **Set up** CI/CD pipeline
7. **Document** deployment process for team

---

## Support Contacts

### Hosting Support:
- Vercel: support@vercel.com
- Netlify: support@netlify.com
- Railway: Discord community

### Framework Support:
- Next.js: GitHub Issues
- React: GitHub Discussions

---

**Your app is ready for the world! 🚀**

*Remember: Start small, iterate fast, listen to users.*
