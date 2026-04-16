# 🚀 QUICK START GUIDE

## Get Running in 3 Minutes

### 1. Install Dependencies
```bash
cd urganize-mvp
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Open Browser
Navigate to: `http://localhost:3000`

---

## First Time Setup

### Create Your First Account
1. You'll see the auth page
2. Click "Sign up"
3. Choose: **"No, I manage myself"** (easier for testing)
4. Fill in:
   - Name: Your name
   - Email: test@example.com
   - Password: password123

### Create Your First Release
1. Dashboard will be empty
2. Click "Create Your First Release"
3. Fill in wizard:
   - **Step 1**: 
     - Type: Single
     - Title: "Test Release"
     - Artist: "Test Artist"
   - **Step 2**: 
     - Release Date: Pick any future date
   - **Step 3**: 
     - Review and click "Create Release"

### Explore the Release
You'll land on the release page with:
- **Overview Tab**: Health score, warnings, next steps
- **Tasks Tab**: 16 pre-generated tasks across 4 phases
- **Files Tab**: Upload files to organized folders

### Try Key Features
1. ✅ **Complete a task**: Go to Tasks, click any checkbox
2. 📁 **Upload a file**: Go to Files, drag/drop a file
3. 📊 **Check progress**: Back to Overview, see health score update
4. 🏠 **View dashboard**: Click "Urganize" logo or "Back to Dashboard"

---

## Test Credentials

For quick testing, use these:
- **Email**: manager@test.com
- **Password**: anything (it's mock auth)

---

## Key Pages

| Page | URL | Purpose |
|------|-----|---------|
| Home | `/` | Redirects to auth or dashboard |
| Auth | `/auth` | Login/Signup |
| Dashboard | `/dashboard` | Overview of all releases |
| Create | `/releases/create` | 3-step release wizard |
| Release | `/releases/[id]` | Release workspace |

---

## Keyboard Shortcuts

None yet - but in production:
- `Cmd+K` - Quick search
- `Cmd+N` - New release
- `Space` - Check/uncheck task

---

## Mobile Testing

To test on your phone:
1. Find your computer's IP: `ipconfig` (Windows) or `ifconfig` (Mac)
2. Start dev server: `npm run dev -- --host`
3. On phone, navigate to: `http://YOUR_IP:3000`

---

## Common First-Time Issues

### "Cannot find module"
```bash
rm -rf node_modules
npm install
```

### Port 3000 already in use
```bash
npm run dev -- -p 3001
```

### Browser cache issues
- Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
- Or: Open in incognito mode

---

## What to Test

### Core Flows
- [ ] Sign up as manager
- [ ] Create a release
- [ ] Complete a task
- [ ] Upload a file
- [ ] Create another release
- [ ] Switch between releases

### Edge Cases
- [ ] Try to create release without title
- [ ] Complete all tasks (see celebration)
- [ ] Delete a file
- [ ] Log out and log back in
- [ ] Refresh page (data persists)

---

## Demo Data Script

Want pre-populated data? Run this in browser console:

```javascript
// Add to localStorage
localStorage.setItem('release-storage', JSON.stringify({
  state: {
    releases: [
      {
        id: '1',
        title: 'Summer Vibes',
        artistName: 'DJ Test',
        type: 'single',
        status: 'in-progress',
        releaseDate: new Date('2026-03-15'),
        userId: '1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ],
    currentRelease: null
  }
}));

// Refresh page
location.reload();
```

---

## Need Help?

1. Check the main README.md
2. Review code comments in components
3. Check browser console for errors
4. Clear localStorage: `localStorage.clear()`

---

## Production Checklist

Before deploying:
- [ ] Replace mock auth with real auth
- [ ] Set up database
- [ ] Implement real file storage
- [ ] Add error boundaries
- [ ] Add analytics
- [ ] Set up monitoring
- [ ] Configure environment variables
- [ ] Add rate limiting
- [ ] Implement CSRF protection
- [ ] Add input sanitization

---

**Ready to ship? Let's go! 🚀**
