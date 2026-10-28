export type MenuItem = { id: string; name: string; description: string; price: number };
export type Menu = { drinks: MenuItem[]; pastries: MenuItem[] };
export type BaristaNote = { note: string; barista: string };
export type Special = { name: string; description: string; price: number; kind: 'drink' | 'pastry' };

export type BookingRequest = { name: string; email: string; date: string; time: string; partySize: number };
export type BookingResult = {
  booking: { id: string; name: string; date: string; time: string; partySize: number };
  message: string;
};
export type StaffBooking = { id: string; name: string; time: string; partySize: number };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request to ${url} failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const getNote = () => getJson<BaristaNote>('/api/note');
export const getMenu = () => getJson<Menu>('/api/menu');
export const getSpecial = () => getJson<Special>('/api/specials/today');
export const getTodaysBookings = () => getJson<{ date: string; bookings: StaffBooking[] }>('/api/bookings');

export async function createBooking(input: BookingRequest): Promise<BookingResult> {
  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Something went wrong. Please try again.');
  return body as BookingResult;
}

export async function downloadBookingsCsv() {
  const res = await fetch('/api/bookings.csv');
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'bookings.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
export const formatPrice = (pence: number) => gbp.format(pence / 100);
