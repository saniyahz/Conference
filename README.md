# 📚 Kids Story Creator

An interactive web application where children can speak their story ideas and watch them come to life with AI-generated text, beautiful illustrations, and interactive features! Includes user authentication, subscription plans, and professional book printing services.

## ✨ Features

- **🎤 Voice Recording**: Kids can speak their story ideas using their device's microphone
- **🤖 AI Story Generation**: Uses free open-source AI models via Hugging Face to create engaging children's stories
- **🎨 Automatic Illustrations**: Generates colorful, kid-friendly images for each page using Stable Diffusion
- **📖 Interactive Book View**: Beautiful book-style presentation with page navigation
- **🔊 Text-to-Speech**: Stories can be read aloud with natural-sounding voices
- **💾 Save Stories**: Registered users can save their favorite stories
- **📥 PDF Download**: Export the complete story as a beautifully formatted PDF book
- **🖨️ Professional Printing**: Order printed books with subscription discounts
- **💳 Subscription Plans**: Multiple tiers with different benefits
- **👤 User Accounts**: Full authentication system with personal dashboards
- **🌐 Web-Based**: Works on any device with a modern web browser

## 💰 Subscription Plans

### Free Plan
- Unlimited story creation
- Save 1 story
- Full print price ($30)

### Monthly Plan ($5/month)
- Unlimited story creation
- Save up to 5 stories per month
- 15% off printing ($25.50)

### Yearly Plan ($48/year)
- Same as Monthly plan
- 20% discount on subscription
- 15% off printing

### Unlimited Monthly ($15/month)
- Unlimited everything
- Save unlimited stories
- 50% off printing ($15)

### Unlimited Yearly ($144/year)
- Same as Unlimited Monthly
- 20% discount on subscription
- 50% off printing

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- A free Hugging Face account and API key
- (Optional) Stripe account for payment processing

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd Conference
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your keys:

   **Required:**
   - `HUGGING_FACE_API_KEY`: Get free at [Hugging Face](https://huggingface.co/settings/tokens)
   - `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`

   **For Production (Optional in Development):**
   - `STRIPE_SECRET_KEY`: Get from [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
   - `STRIPE_PUBLISHABLE_KEY`: Get from Stripe Dashboard
   - `STRIPE_WEBHOOK_SECRET`: Get after setting up webhooks
   - `NEXT_PUBLIC_APP_URL`: Your production URL

4. **Set up the database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**

   Navigate to [http://localhost:3000](http://localhost:3000)

## 🎯 How to Use

### Creating Stories
1. **Start Recording**: Click the large microphone button and allow microphone access
2. **Tell Your Story**: Speak your story ideas - talk about characters, adventures, magical places!
3. **Create Story**: Click "Create My Story!" and wait while AI generates your personalized story
4. **Read & Listen**: Navigate through pages, use "Read Aloud" to hear it spoken
5. **Save**: Sign in and save your story to your dashboard
6. **Download**: Get a PDF copy to share with family and friends

### Managing Your Account
1. **Sign Up**: Create a free account to save stories
2. **Upgrade**: Choose a subscription plan for more storage and print discounts
3. **Dashboard**: View all your saved stories and account details
4. **Print Orders**: Order professional printed books with your subscription discount

## 🛠️ Technology Stack

### Frontend
- **Framework**: Next.js 14 with React and TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: NextAuth.js
- **State Management**: React Hooks

### Backend
- **API Routes**: Next.js API routes
- **Database**: Prisma ORM with SQLite (dev) / PostgreSQL (prod)
- **Payments**: Stripe
- **Authentication**: NextAuth.js with credentials provider

### AI & Media
- **Text Generation**: Mistral-7B or Flan-T5 via Hugging Face
- **Image Generation**: Stable Diffusion 2.1 via Hugging Face
- **Speech Recognition**: Web Speech API (browser native)
- **Text-to-Speech**: Web Speech Synthesis API
- **PDF Generation**: jsPDF

## 📁 Project Structure

```
Conference/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── [...nextauth]/   # NextAuth configuration
│   │   │   └── signup/          # User registration
│   │   ├── generate-story/      # AI story generation
│   │   ├── generate-pdf/        # PDF creation
│   │   ├── stories/             # Story CRUD operations
│   │   ├── subscriptions/       # Stripe checkout
│   │   ├── webhooks/            # Stripe webhooks
│   │   └── print-order/         # Print order management
│   ├── auth/
│   │   ├── signin/              # Sign in page
│   │   └── signup/              # Sign up page
│   ├── dashboard/               # User dashboard
│   ├── pricing/                 # Subscription plans
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                 # Main app page
├── components/
│   ├── SpeechRecorder.tsx       # Voice recording
│   ├── StoryBook.tsx            # Book display
│   ├── LoadingSpinner.tsx       # Loading indicator
│   └── SessionProvider.tsx      # Auth provider
├── lib/
│   ├── prisma.ts                # Database client
│   ├── auth.ts                  # Auth configuration
│   └── subscriptions.ts         # Subscription logic
├── prisma/
│   └── schema.prisma            # Database schema
├── types/
│   └── next-auth.d.ts           # TypeScript definitions
├── .env.local                   # Environment variables
├── package.json
└── README.md
```

## 🔧 Configuration

### Database Setup

The app uses SQLite for development and can be configured for PostgreSQL in production.

To set up the database:
```bash
npx prisma generate
npx prisma db push
```

To view the database:
```bash
npx prisma studio
```

### Stripe Setup (Optional)

1. Create a [Stripe account](https://stripe.com)
2. Get your API keys from the [Dashboard](https://dashboard.stripe.com/apikeys)
3. Set up a webhook endpoint pointing to `/api/webhooks/stripe`
4. Add the webhook secret to your environment variables
5. Test with Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

### NextAuth Setup

Generate a secure secret:
```bash
openssl rand -base64 32
```

Add it to your `.env.local` as `NEXTAUTH_SECRET`

## 🌐 Browser Compatibility

### Speech Recognition (Microphone Input)
- ✅ Chrome/Edge (recommended)
- ✅ Safari (iOS/macOS)
- ⚠️ Firefox (limited support)

**Note**: If speech recognition isn't supported, the app provides a text input fallback.

### Text-to-Speech
- ✅ All modern browsers (Chrome, Firefox, Safari, Edge)

## 🐛 Troubleshooting

### "Microphone not working"
- Grant microphone permissions in your browser
- Use Chrome or Edge for best compatibility
- Use the text input fallback if speech recognition isn't available

### "API key not configured"
- Add your Hugging Face API key to `.env.local`
- Restart the development server

### "Story generation is slow"
- Free Hugging Face models may have rate limits
- First request may be slower as models load
- Consider using paid API for faster generation

### "Images not generating"
- Image generation can take 20-30 seconds per image
- Check Hugging Face API rate limits
- Stories still work without images

### "Database errors"
- Run `npx prisma generate` to regenerate the Prisma client
- Run `npx prisma db push` to sync your schema
- Delete `dev.db` and run `npx prisma db push` to reset

### "Stripe webhooks not working"
- Use Stripe CLI for local testing
- Ensure webhook endpoint is publicly accessible in production
- Verify webhook secret matches your environment variable

## 🚀 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import your repository to [Vercel](https://vercel.com)
3. Add all environment variables
4. Update `DATABASE_URL` to use PostgreSQL (recommended: Vercel Postgres)
5. Deploy!

### Environment Variables for Production

Make sure to set all these in your hosting platform:
- `HUGGING_FACE_API_KEY`
- `DATABASE_URL` (PostgreSQL connection string)
- `NEXTAUTH_URL` (your production URL)
- `NEXTAUTH_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`

### Database Migration

For production, switch from SQLite to PostgreSQL:

1. Update `DATABASE_URL` in your environment
2. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Run migrations:
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

## 📝 Future Enhancements

- [ ] Multiple story themes (fairy tales, adventures, space, etc.)
- [ ] Character customization
- [ ] Multiple language support
- [ ] Story collaboration features
- [ ] Parent dashboard for managing children's accounts
- [ ] Integration with real printing services (Printful, Lulu, etc.)
- [ ] Story sharing and community features
- [ ] Mobile app versions

## 🔒 Security Notes

- User passwords are hashed with bcrypt
- All API routes are protected with authentication checks
- Subscription limits are enforced server-side
- Stripe webhooks are verified with signatures
- Environment variables keep sensitive data secure

## 📄 License

This project is open source and available for personal and educational use.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- AI powered by [Hugging Face](https://huggingface.co/)
- Payments by [Stripe](https://stripe.com/)
- Authentication by [NextAuth.js](https://next-auth.js.org/)
- Icons by [Lucide](https://lucide.dev/)

## 💡 Contributing

Feel free to submit issues and enhancement requests!

## 📧 Support

For issues and questions, please create an issue on GitHub.

---

Made with ❤️ for creative kids everywhere!
