# Urganize MVP - Music Release Management System

An opinionated, release-first operating system for music teams. Built with Next.js 15, TypeScript, and Tailwind CSS.

## 🚀 Features

### Core Functionality
- **Authentication**: Role-based signup (Artist-Manager vs Artist with Manager)
- **Release Management**: Create and organize music releases
- **Pre-defined Tasks**: Auto-generated task frameworks across 4 phases
  - Pre-production
  - Production  
  - Promotion (emphasis)
  - Distribution
- **File Management**: Organized file system with categories
  - Audio (required)
  - Stems
  - Artwork
  - Licenses
  - Contracts
- **Release Health Tracking**: Visual progress indicators
- **Task Completion**: Check off tasks with status tracking

### MVP Scope (What's Included)
✅ User authentication
✅ Release creation wizard
✅ Dashboard with active releases
✅ Release workspace with tabs (Overview, Tasks, Files)
✅ Pre-defined task templates
✅ File upload and organization
✅ Release health scoring
✅ Urgent task detection
✅ Mobile-responsive design

### What's NOT in MVP (Future Features)
❌ Revenue tracking
❌ Payment processing
❌ Legal contracts
❌ Analytics/streaming stats
❌ AI recommendations
❌ Social media integration
❌ Team collaboration (invite users)
❌ Budget tracking
❌ Timeline/calendar views
❌ Real file storage (uses mock URLs)

## 🛠 Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand (with persistence)
- **Date Handling**: date-fns
- **Icons**: Lucide React
- **File Upload**: react-dropzone

## 📦 Installation

1. **Clone or extract the project**:
```bash
cd urganize-mvp
```

2. **Install dependencies**:
```bash
npm install
```

3. **Run development server**:
```bash
npm run dev
```

4. **Open in browser**:
Navigate to `http://localhost:3000`

## 🗂 Project Structure

```
urganize-mvp/
├── app/
│   ├── auth/               # Authentication pages
│   ├── dashboard/          # Main dashboard
│   ├── releases/
│   │   ├── create/         # Create release wizard
│   │   └── [id]/           # Release detail page
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home/redirect page
├── components/
│   ├── ui/                 # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   └── StatusBadge.tsx
│   ├── releases/           # Release-specific components
│   │   └── ReleaseCard.tsx
│   ├── tasks/              # Task components
│   │   └── TaskList.tsx
│   └── files/              # File management
│       └── FileUpload.tsx
├── lib/                    # Business logic
│   ├── auth-store.ts       # Authentication state
│   ├── release-store.ts    # Release management
│   ├── task-store.ts       # Task management + templates
│   └── file-store.ts       # File management
├── types/
│   └── index.ts            # TypeScript types
└── public/                 # Static assets
```

## 🎯 User Flows

### 1. First Time User
1. Land on home page → Redirected to `/auth`
2. Click "Sign up" → Select role (Manager vs Artist)
3. Fill in details → Create account
4. Redirected to dashboard (empty state)
5. Click "Create Your First Release"
6. Complete 3-step wizard:
   - Basic info (title, artist, type)
   - Timeline (optional release date)
   - Review and create
7. Redirected to release workspace with auto-generated tasks

### 2. Create a Release
1. From dashboard, click "+ New Release"
2. **Step 1**: Select type (Single/EP/Album), enter title and artist
3. **Step 2**: Set release date (optional)
4. **Step 3**: Review and confirm
5. System auto-generates:
   - 16 pre-defined tasks
   - 5 file categories
   - Release workspace

### 3. Manage a Release
1. Click on release card from dashboard
2. Navigate between tabs:
   - **Overview**: Health score, warnings, next steps
   - **Tasks**: Complete tasks by phase
   - **Files**: Upload files to organized folders
3. Track progress via health bar
4. Complete tasks by checking boxes
5. Upload files via drag-and-drop

### 4. Complete Tasks
1. Go to Tasks tab
2. Tasks organized by phase
3. Click checkbox to complete
4. Overdue tasks show in red
5. Completed tasks fade out
6. Progress reflects in health score

### 5. Upload Files
1. Go to Files tab
2. Select category (Audio, Stems, Artwork, etc.)
3. Drag files or click to browse
4. Files organize automatically
5. Download or delete files
6. Required audio file enforced

## 🔑 Key Design Decisions

### Why These Choices Were Made

1. **Opinionated System**
   - Pre-defined tasks instead of blank slates
   - Enforced structure (audio file required)
   - Default folders created automatically
   - *Rationale*: Managers told us they want structure, not flexibility

2. **Release-First Architecture**
   - Everything attaches to a release
   - No global tasks or files
   - Release is the core object
   - *Rationale*: This mirrors how music careers actually work

3. **Promotion Emphasis**
   - Promotion tasks visible immediately
   - Dedicated phase with most tasks
   - Timeline prompts built in
   - *Rationale*: Interviews showed promotion is highest chaos phase

4. **Client-Side State (Zustand)**
   - Local storage persistence
   - No backend required for MVP
   - Fast, responsive UX
   - *Rationale*: Ship faster, validate concept before building infrastructure

5. **Mock File Storage**
   - Uses blob URLs, not real cloud storage
   - Files lost on refresh
   - *Rationale*: MVP scope - real storage requires backend

## 🚨 Known Limitations (MVP)

1. **No Real Backend**
   - All data stored in browser localStorage
   - Data lost if user clears browser data
   - No sync across devices

2. **Mock Authentication**
   - No password hashing
   - No email verification
   - Anyone can "log in" with any credentials

3. **File Storage**
   - Files use blob URLs (temporary)
   - Files lost on page refresh
   - No cloud storage integration

4. **Single User**
   - No collaboration features
   - Can't invite team members
   - No permissions system

5. **No Real-Time Updates**
   - No websockets or polling
   - Changes only visible on refresh

6. **Limited Task Management**
   - Can't edit task details
   - Can't add custom fields
   - Can't reorder tasks

## 🔄 Converting to Production

To make this production-ready:

1. **Add Backend**
   - Set up database (PostgreSQL recommended)
   - Create API routes in Next.js
   - Implement proper authentication (NextAuth.js)

2. **Implement Cloud Storage**
   - AWS S3 or Cloudflare R2
   - Signed URLs for secure uploads
   - Thumbnail generation

3. **Add Real-Time Features**
   - Websockets for live updates
   - Presence indicators
   - Collaborative editing

4. **Team Features**
   - User invitations
   - Role-based permissions
   - Activity logs

5. **Enhanced Task Management**
   - Task editing
   - Custom fields
   - Due date reminders
   - Email notifications

6. **Analytics**
   - User behavior tracking
   - Feature usage metrics
   - Performance monitoring

## 📱 Mobile Responsiveness

The app is mobile-responsive with:
- Collapsible navigation
- Touch-optimized buttons (44x44px minimum)
- Scrollable content areas
- Adaptive layouts (grid → stack on mobile)

Test on mobile:
```bash
# Access from phone on same network
npm run dev -- --host
```

## 🎨 Design System

### Colors
- **Primary**: Emerald-500 (#10b981)
- **Background**: Slate-950 to Black gradient
- **Surface**: Slate-900/50 with borders
- **Text**: Slate-100 (primary), Slate-400 (secondary)

### Typography
- **Display**: Space Grotesk (headers)
- **Body**: DM Sans (content)

### Components
All components in `/components/ui/` follow consistent patterns:
- Rounded corners (xl = 12px, 2xl = 16px)
- Transitions (200ms cubic-bezier)
- Focus states (ring-2 ring-emerald-500)
- Hover states (opacity or color shift)

## 🧪 Testing

Currently no tests included. To add:

```bash
npm install -D @testing-library/react @testing-library/jest-dom jest
```

Recommended test coverage:
- Store operations (Zustand)
- Component rendering
- User interactions
- Form validation

## 🚢 Deployment

### Vercel (Recommended)
```bash
npm install -g vercel
vercel
```

### Netlify
```bash
npm run build
# Deploy /out folder
```

### Self-Hosted
```bash
npm run build
npm start
```

## 🐛 Common Issues

### "Module not found" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### Hot reload not working
```bash
# Restart dev server
npm run dev
```

### TypeScript errors
```bash
# Clear Next.js cache
rm -rf .next
npm run dev
```

### Zustand state not persisting
- Check browser localStorage isn't full
- Check browser privacy settings allow localStorage
- Check for conflicting extensions

## 📄 License

Private - Not for redistribution

## 🤝 Contributing

This is an MVP. For production version, consider:
- Code review process
- Testing requirements
- Documentation standards
- Commit message conventions

## 📞 Support

For issues or questions:
- Check this README
- Review code comments
- Check Next.js docs: https://nextjs.org/docs
- Check Zustand docs: https://docs.pmnd.rs/zustand

## 🎯 Next Steps After MVP

1. **User Testing**
   - Get 10-20 managers using it
   - Collect feedback
   - Identify pain points

2. **Critical Features**
   - Real backend + auth
   - File storage
   - Team collaboration

3. **Polish**
   - Error handling
   - Loading states
   - Empty state improvements
   - Onboarding flow

4. **Scale**
   - Database optimization
   - Caching strategy
   - CDN for assets
   - Performance monitoring

---

**Built with ❤️ for music teams who refuse to lose releases to chaos.**

*Launching January 28, 2026*
