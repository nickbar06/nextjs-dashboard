'use server';

import { z } from 'zod';
import { MongoClient, ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { signIn, signOut } from '@/auth';
import { AuthError } from 'next-auth';
import { cookies } from 'next/headers';

const client = new MongoClient('mongodb://localhost:27017'); // Replace with your MongoDB URI

const FormSchema = z.object({
    id: z.string(),
    customer_id: z.string(),
    amount: z.coerce.number(),
    status: z.enum(['pending', 'paid']),
    date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export async function createInvoice(formData: FormData) {
    const { customer_id, amount, status } = CreateInvoice.parse({
        customer_id: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];

    try {
        await client.connect();
        const db = client.db('Dashboard')

        const invoicesCollection = db.collection('invoices');
        await invoicesCollection.insertOne({ customer_id, amount: amountInCents, status, date });

        revalidatePath('/dashboard/invoices');
        redirect('/dashboard/invoices');
    } catch (error) {
        throw error;
    }

}

export async function updateInvoice(id: string, formData: FormData) {
    const { customer_id, amount, status } = UpdateInvoice.parse({
        customer_id: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    console.log(customer_id, amount, status);
    const amountInCents = amount * 100;

    try {
        await client.connect();
        const db = client.db('Dashboard')

        const invoicesCollection = db.collection('invoices');
        await invoicesCollection.updateOne(
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            { "_id": id },
            { $set: { customer_id: customer_id, amount: amountInCents, status: status } }
        );

        revalidatePath('/dashboard/invoices');
        redirect('/dashboard/invoices');
    } catch (error) {
        throw error;
    }
}

export async function deleteInvoice(id: string) {
    try {
        console.log(id);
        await client.connect();
        const db = client.db('Dashboard')

        const invoicesCollection = db.collection('invoices');
        const resp = await invoicesCollection.deleteOne(
            { "_id": new ObjectId(id) },
        );

        console.log(resp)
        revalidatePath('/dashboard/invoices');
    } catch (error) {
        throw error;
    }
}

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.';
                default:
                    return 'Something went wrong.';
            }
        }
        throw error;
    }
}