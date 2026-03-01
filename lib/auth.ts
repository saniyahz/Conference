import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials')
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email,
          },
          include: {
            subscription: true,
          },
        })

        if (!user || !user.password) {
          throw new Error('Invalid credentials')
        }

        const isCorrectPassword = await compare(credentials.password, user.password)

        if (!isCorrectPassword) {
          throw new Error('Invalid credentials')
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
      }
      // For OAuth sign-ups, ensure subscription and usage tracking are created
      if (account && user) {
        await ensureUserSetup(user.id as string)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string

        // Fetch subscription info
        const subscription = await prisma.subscription.findUnique({
          where: { userId: token.id as string },
        })

        session.user.subscription = subscription
          ? {
              plan: subscription.plan,
              audience: subscription.audience,
              status: subscription.status,
              billingCycle: subscription.billingCycle,
            }
          : null
      }
      return session
    },
    async signIn({ user, account }) {
      // For OAuth providers, ensure user setup is done
      if (account?.provider !== 'credentials' && user.id) {
        await ensureUserSetup(user.id)
      }
      return true
    },
  },
  events: {
    async createUser({ user }) {
      // When a new user is created (OAuth), set up subscription and usage tracking
      await ensureUserSetup(user.id)
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
}

// Helper function to ensure user has subscription and usage tracking
async function ensureUserSetup(userId: string) {
  // Create subscription if it doesn't exist
  const existingSubscription = await prisma.subscription.findUnique({
    where: { userId },
  })

  if (!existingSubscription) {
    await prisma.subscription.create({
      data: {
        userId,
        plan: 'free',
        status: 'active',
      },
    })
  }

  // Create usage tracking if it doesn't exist
  const existingUsage = await prisma.usageTracking.findUnique({
    where: { userId },
  })

  if (!existingUsage) {
    await prisma.usageTracking.create({
      data: {
        userId,
      },
    })
  }
}
