import { MongoClient } from 'mongodb';
import {
  CustomerField,
  Customer,
  CustomersTableType,
  Invoice,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  LatestInvoice,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';

const client = new MongoClient('mongodb://localhost:27017'); // Replace with your MongoDB URI

export async function fetchRevenue(): Promise<Revenue[]> {
  try {
    await client.connect();
    const db = client.db('Dashboard');

    const revenueCollection = db.collection('revenue');

    console.log('Fetching revenue data...');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const data = await revenueCollection.find({}, { projection: { _id: 0, month: 1, revenue: 1 } }).toArray();

    const revenueData: Revenue[] = data.map(item => ({
      month: item.month,
      revenue: item.revenue
    }));
    return revenueData;;
  } catch (error) {
    console.error('Database Error:', error);
    throw (error);
  } finally {
    // await client.close();
  }
}

export async function fetchLatestInvoices(): Promise<LatestInvoice[]> {
  try {
    await client.connect();
    const db = client.db('Dashboard');

    const invoiceList = await db.collection('invoices').find().limit(5).toArray();
    const customerData = await db.collection('customers').find().toArray();

    const custList: Customer[] = customerData.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      image_url: customer.image_url
    }));


    var arr: LatestInvoice[] = [];
    invoiceList.forEach((inv) => {
      var cust: Customer | undefined = custList.find((customer) => inv.customer_id === customer.id);
      var rowData: LatestInvoice = {
        amount: inv.amount,
        name: cust?.name || "",
        image_url: cust?.image_url || "",
        email: cust?.email || "",
        id: inv._id.toString(),
      }
      arr.push(rowData);
    })

    const latestInvoices: LatestInvoice[] = arr.map((invoice) => ({
      ...invoice,
      amount: formatCurrency((Number.parseInt(invoice.amount))),
    }));
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw error;
  } finally {
    // await client.close();
  }
}

export async function fetchCardData(): Promise<{ numberOfCustomers: number, numberOfInvoices: number, totalPaidInvoices: string, totalPendingInvoices: string }> {
  try {
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.

    await client.connect();
    const db = client.db('Dashboard');
    const invoicesCollection = db.collection('invoices');
    const customerCollection = db.collection('customers');

    const invoiceCountPromise = invoicesCollection.countDocuments();
    const customerCountPromise = customerCollection.countDocuments();
    const invoiceStatusPromise = invoicesCollection.aggregate([
      {
        $group: {
          _id: null,
          paid: {
            $sum: {
              $cond: { if: { $eq: ['$status', 'paid'] }, then: '$amount', else: 0 }
            }
          },
          pending: {
            $sum: {
              $cond: { if: { $eq: ['$status', 'pending'] }, then: '$amount', else: 0 }
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          paid: 1,
          pending: 1
        }
      }
    ]).toArray();

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(data[0] ?? 0);
    const numberOfCustomers = Number(data[1] ?? 0);
    const invoiceStatus = data[2][0] || { paid: 0, pending: 0 }; // Get the first (and only) element
    const totalPaidInvoices = formatCurrency(invoiceStatus.paid);
    const totalPendingInvoices = formatCurrency(invoiceStatus.pending);

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw error;
  } finally {
    // await client.close();
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    await client.connect();
    const db = client.db('Dashboard'); // Replace with your database name
    const invoicesCollection = db.collection('invoices');


    const invoices = await invoicesCollection.aggregate([
      {
        $lookup: {
          from: 'customers',
          localField: 'customer_id',
          foreignField: 'id',
          as: 'customer_info'
        }
      },
      {
        $unwind: { path: '$customer_info', }
      },
      {
        $match: {
          $or: [
            { 'customer_info.name': { $regex: query, $options: 'i' } },
            { 'customer_info.email': { $regex: query, $options: 'i' } },
            { amount: { $regex: query, $options: 'i' } },
            { date: { $regex: query, $options: 'i' } },
            { status: { $regex: query, $options: 'i' } }
          ]
        }
      },
      { $sort: { date: -1 } },
      { $skip: offset },
      { $limit: ITEMS_PER_PAGE },
      {
        $project: {
          id: 1,
          amount: 1,
          date: 1,
          status: 1,
          name: '$customer_info.name',
          email: '$customer_info.email',
          image_url: '$customer_info.image_url'
        }
      }
    ]).toArray();
    return invoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  } finally {
    // await client.close();
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    await client.connect();
    const db = client.db('Dashboard'); // Replace with your database name
    const invoicesCollection = db.collection('invoices');
    const customersCollection = db.collection('customers');

    const count = await invoicesCollection.aggregate([
      {
        $lookup: {
          from: 'customers',
          localField: 'customer_id',
          foreignField: 'id',
          as: 'customer_info'
        }
      },
      { $unwind: '$customer_info' },
      {
        $match: {
          $or: [
            { 'customer_info.name': { $regex: query, $options: 'i' } },
            { 'customer_info.email': { $regex: query, $options: 'i' } },
            { amount: { $regex: query, $options: 'i' } },
            { date: { $regex: query, $options: 'i' } },
            { status: { $regex: query, $options: 'i' } }
          ]
        }
      },
      { $count: 'total' }
    ]).toArray();

    const totalPages = Math.ceil((count[0] ? count[0].total : 0) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
  } finally {
    // await client.close();
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    await client.connect();
    const db = client.db('dashboard'); // Replace with your database name
    const invoicesCollection = db.collection('invoices');

    const invoice = await invoicesCollection.findOne({ id });

    if (invoice) {
      invoice.amount = invoice.amount / 100; // Convert amount from cents to dollars
    }

    return invoice;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  } finally {
    // await client.close();
  }
}

export async function fetchCustomers() {
  try {
    await client.connect();
    const db = client.db('dashboard'); // Replace with your database name
    const customersCollection = db.collection('customers');

    const customers = await customersCollection.find().sort({ name: 1 }).project({ id: 1, name: 1 }).toArray();

    return customers;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch all customers.');
  } finally {
    // await client.close();
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    await client.connect();
    const db = client.db('dashboard'); // Replace with your database name
    const customersCollection = db.collection('customers');
    const invoicesCollection = db.collection('invoices');

    const customers = await customersCollection.aggregate([
      {
        $lookup: {
          from: 'invoices',
          localField: 'id',
          foreignField: 'customer_id',
          as: 'invoices'
        }
      },
      {
        $match: {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } }
          ]
        }
      },
      {
        $project: {
          id: 1,
          name: 1,
          email: 1,
          image_url: 1,
          total_invoices: { $size: '$invoices' },
          total_pending: {
            $sum: {
              $map: {
                input: '$invoices',
                as: 'invoice',
                in: { $cond: [{ $eq: ['$$invoice.status', 'pending'] }, '$$invoice.amount', 0] }
              }
            }
          },
          total_paid: {
            $sum: {
              $map: {
                input: '$invoices',
                as: 'invoice',
                in: { $cond: [{ $eq: ['$$invoice.status', 'paid'] }, '$$invoice.amount', 0] }
              }
            }
          }
        }
      },
      { $sort: { name: 1 } }
    ]).toArray();

    const formattedCustomers = customers.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid)
    }));

    return formattedCustomers;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer table.');
  } finally {
    // await client.close();
  }
}
