# Bug Report & Feature Request Feedback System

This document explains how the in-app feedback system works in Amigo and provides a guide for implementing a similar system in your own application.

## Overview

The feedback system consists of four main parts:

1. **Floating Button Component** - A persistent button visible on all pages
2. **Modal with Two-Step Flow** - Type selection → Form submission
3. **API Routes** - Backend endpoints for CRUD operations
4. **Admin Inbox** - Dashboard for reviewing and managing feedback

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  FeedbackButton.tsx │────▶│  /api/upload     │────▶│  Image stored as  │
│  (Client Component) │     │  (Image upload)  │     │  base64 data URL  │
│                     │     └──────────────────┘     └───────────────────┘
│                     │
│                     │     ┌──────────────────┐     ┌───────────────────┐
│                     │────▶│  /api/feedback   │────▶│  PostgreSQL       │
│                     │     │  (CRUD)          │     │  (Prisma)         │
└─────────────────────┘     └──────────────────┘     └───────────────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │  Admin Inbox     │
                            │  /dashboard/inbox│
                            └──────────────────┘
```

---

## Database Schema

```prisma
enum FeedbackType {
  BUG
  FEATURE
}

model Feedback {
  id          String       @id @default(cuid())
  userId      String
  type        FeedbackType
  message     String       @db.Text
  imageUrl    String?      // Single image (legacy support)
  imageUrls   String?      @db.Text // JSON array of image URLs
  userAgent   String?      // Browser/device info
  pageUrl     String?      // Page where user submitted
  isRead      Boolean      @default(false)
  isResolved  Boolean      @default(false)
  createdAt   DateTime     @default(now())

  @@index([userId])
  @@index([type])
  @@index([isRead])
  @@map("feedback")
}
```

### Key Design Decisions

- **`imageUrls` as JSON string**: Stores multiple images without requiring a separate table
- **Backwards compatibility**: `imageUrl` (singular) kept for legacy support
- **Context capture**: `userAgent` and `pageUrl` help reproduce bugs
- **Status tracking**: `isRead` and `isResolved` for workflow management

---

## Components

### 1. Floating Feedback Button

**Location**: `src/components/feedback-button.tsx`

The button is a self-contained client component that includes:
- Floating button UI (positioned bottom-left on mobile, bottom-right on desktop)
- Modal with backdrop
- Two-step flow (type selection → form)
- Image upload with preview
- Clipboard paste support (Ctrl+V)

#### Key Features

```tsx
// State management
const [isOpen, setIsOpen] = useState(false);
const [step, setStep] = useState<"select" | "form">("select");
const [feedbackType, setFeedbackType] = useState<"BUG" | "FEATURE" | null>(null);
const [imageFiles, setImageFiles] = useState<File[]>([]);
const [imagePreviews, setImagePreviews] = useState<string[]>([]);
```

#### Image Handling

The component supports:
- File picker (click to upload)
- Clipboard paste (Ctrl+V for screenshots)
- Multiple images (configurable limit, default 5)
- Client-side validation (file type, size)
- Preview grid with remove buttons

```tsx
// Clipboard paste handler
useEffect(() => {
  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      processImageFiles(imageFiles);
    }
  };

  document.addEventListener("paste", handlePaste);
  return () => document.removeEventListener("paste", handlePaste);
}, [isOpen, step]);
```

---

### 2. Image Upload API

**Location**: `src/app/api/upload/route.ts`

Uses [sharp](https://sharp.pixelplumbing.com/) for image compression:

```tsx
import sharp from "sharp";

export async function POST(request: Request) {
  // Auth check
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;

  // Validate file type and size
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  // Compress and convert to WebP
  const buffer = Buffer.from(await file.arrayBuffer());
  const compressedBuffer = await sharp(buffer)
    .resize(800, 600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();

  // Return as base64 data URL
  const base64 = compressedBuffer.toString("base64");
  const imageUrl = `data:image/webp;base64,${base64}`;

  return NextResponse.json({ imageUrl });
}
```

#### Why Base64?

- **Serverless compatible**: No file system access needed
- **No external storage**: Images stored directly in database
- **Simple deployment**: No S3/Cloudinary configuration
- **Tradeoff**: Larger database size, limited to smaller images

---

### 3. Feedback API

**Location**: `src/app/api/feedback/route.ts`

Implements full CRUD:

| Method | Purpose | Access |
|--------|---------|--------|
| POST | Create feedback | Authenticated users |
| GET | List all feedback | Admin only |
| PATCH | Mark read/resolved | Admin only |
| DELETE | Delete feedback | Admin only |

#### Create Feedback (POST)

```tsx
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, message, pageUrl, userAgent, imageUrl, imageUrls } = await request.json();

  // Validation
  if (!type || !message) {
    return NextResponse.json({ error: "Type and message are required" }, { status: 400 });
  }

  if (!["BUG", "FEATURE"].includes(type)) {
    return NextResponse.json({ error: "Invalid feedback type" }, { status: 400 });
  }

  const feedback = await prisma.feedback.create({
    data: {
      userId: session.user.id,
      type,
      message,
      pageUrl,
      userAgent,
      imageUrl: imageUrl || null,
      imageUrls: imageUrls?.length > 0 ? JSON.stringify(imageUrls) : null,
    },
  });

  return NextResponse.json({ feedback });
}
```

#### Admin Access Control

Simple email-based admin check:

```tsx
const adminEmail = "admin@example.com";
if (session.user.email !== adminEmail) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

For production, consider:
- Role-based access in database
- Admin flag on User model
- Separate admin user table

---

### 4. Admin Inbox

**Location**: `src/app/dashboard/inbox/page.tsx`

Features:
- Filter by type (Bug/Feature) or status (Unread)
- Mark as read/unread
- Mark as resolved
- Delete feedback
- Image lightbox for viewing screenshots
- User info display

#### Handling Multiple Images

```tsx
// Helper to get all images (supports legacy and new format)
function getImageUrls(item: FeedbackItem): string[] {
  // Try new format first (JSON array)
  if (item.imageUrls) {
    try {
      const parsed = JSON.parse(item.imageUrls);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Invalid JSON, fall through
    }
  }
  // Fall back to legacy single image
  if (item.imageUrl) {
    return [item.imageUrl];
  }
  return [];
}
```

---

## Implementation Guide for Your App

### Step 1: Database Setup

Add the Feedback model to your schema:

```prisma
enum FeedbackType {
  BUG
  FEATURE
}

model Feedback {
  id          String       @id @default(cuid())
  userId      String
  type        FeedbackType
  message     String       @db.Text
  imageUrls   String?      @db.Text
  userAgent   String?
  pageUrl     String?
  isRead      Boolean      @default(false)
  isResolved  Boolean      @default(false)
  createdAt   DateTime     @default(now())

  @@map("feedback")
}
```

Run migration:
```bash
npx prisma db push
npx prisma generate
```

### Step 2: Install Dependencies

```bash
npm install sharp
```

### Step 3: Create API Routes

1. **Image upload**: `/api/upload/route.ts`
2. **Feedback CRUD**: `/api/feedback/route.ts`

### Step 4: Create Feedback Button Component

Copy and adapt `feedback-button.tsx`:

1. Update styling to match your design system
2. Configure `MAX_IMAGES` limit
3. Update API endpoints if different
4. Add i18n if needed

### Step 5: Add to Layout

```tsx
// app/layout.tsx or dashboard layout
import FeedbackButton from "@/components/feedback-button";

export default function Layout({ children }) {
  return (
    <>
      {children}
      <FeedbackButton />
    </>
  );
}
```

### Step 6: Create Admin Page

Create `/dashboard/inbox/page.tsx` for reviewing feedback.

---

## Customization Ideas

### Alternative Storage Options

Instead of base64, consider:

```tsx
// S3 Upload
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const key = `feedback/${Date.now()}-${file.name}`;

await s3.send(new PutObjectCommand({
  Bucket: process.env.S3_BUCKET,
  Key: key,
  Body: buffer,
  ContentType: "image/webp",
}));

const imageUrl = `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`;
```

### Email Notifications

Send email when feedback is submitted:

```tsx
// In POST handler after creating feedback
await resend.emails.send({
  from: "noreply@yourapp.com",
  to: "admin@yourapp.com",
  subject: `New ${type} Report`,
  html: `<p>User ${session.user.email} submitted: ${message}</p>`,
});
```

### Slack Integration

Post to Slack channel:

```tsx
await fetch(process.env.SLACK_WEBHOOK_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: `New ${type}: ${message}`,
    attachments: imageUrls.map(url => ({ image_url: url })),
  }),
});
```

### Additional Fields

Consider adding:
- `priority` (LOW, MEDIUM, HIGH, CRITICAL)
- `status` (NEW, IN_PROGRESS, RESOLVED, WONT_FIX)
- `assignedTo` (for team assignment)
- `category` (UI, Performance, Data, etc.)
- `appVersion` (for tracking regressions)

---

## Translations

Add to your i18n messages:

```json
{
  "feedback": {
    "title": "Feedback",
    "selectType": "What would you like to share?",
    "reportBug": "Report a Bug",
    "reportBugDesc": "Something not working? Let us know",
    "requestFeature": "Request a Feature",
    "requestFeatureDesc": "Have an idea? We'd love to hear it",
    "describeBug": "Describe the bug",
    "describeFeature": "Describe your idea",
    "bugPlaceholder": "What happened? What did you expect?",
    "featurePlaceholder": "Tell us about your idea...",
    "attachScreenshots": "Attach screenshots (optional)",
    "clickToUpload": "Click to upload or paste (Ctrl+V)",
    "submit": "Submit",
    "submitting": "Submitting...",
    "thankYou": "Thank you!",
    "thankYouMessage": "Your feedback has been received."
  }
}
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/components/feedback-button.tsx` | Floating button + modal component |
| `src/app/api/upload/route.ts` | Image upload endpoint |
| `src/app/api/feedback/route.ts` | Feedback CRUD API |
| `src/app/dashboard/inbox/page.tsx` | Admin inbox page |
| `prisma/schema.prisma` | Database schema (Feedback model) |
| `src/messages/*.json` | Translations |

---

## Summary

This feedback system provides a complete solution for collecting user bug reports and feature requests. The key design principles are:

1. **Low friction** - Floating button always accessible
2. **Context capture** - Automatic page URL and user agent
3. **Visual evidence** - Screenshot support with paste functionality
4. **Simple workflow** - Read/resolve status for managing feedback
5. **Serverless friendly** - Base64 image storage, no external dependencies

The system is designed to be self-contained and easy to adapt for any Next.js application.
