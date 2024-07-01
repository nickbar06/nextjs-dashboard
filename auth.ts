import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { MongoClient } from 'mongodb';
import type { User } from '@/app/lib/definitions';
import bcrypt from 'bcrypt';

const client = new MongoClient('mongodb://localhost:27017'); // Replace with your MongoDB URI

async function getUser(email: string): Promise<User | undefined> {
    try {
        await client.connect();
        const db = client.db('Dashboard');

        const usersCollection = db.collection<User>('users');

        const user = await usersCollection.findOne({ email: email });

        return user || undefined;
    } catch (error) {
        console.error('Failed to fetch user:', error);
        throw new Error('Failed to fetch user.');
    }
}

export const { auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            async authorize(credentials) {
                const parsedCredentials = z
                    .object({ email: z.string().email(), password: z.string().min(6) })
                    .safeParse(credentials);

                if (parsedCredentials.success) {
                    const { email, password } = parsedCredentials.data;
                    const user = await getUser(email);
                    if (!user) return null;
                    const passwordsMatch = await bcrypt.compare(password, user.password);

                    if (passwordsMatch) return user;
                }

                console.log('Invalid credentials');
                return null;
            },
        }),
    ],
});