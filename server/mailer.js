// Booking confirmation emails. Uses SMTP when SMTP_URL is set, otherwise logs.
import nodemailer from 'nodemailer';
import { SHOP_NAME } from './cafe.js';

const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
const from = process.env.MAIL_FROM || `${SHOP_NAME} <hello@cozycoffeetable.example>`;

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function formatDate(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

export async function sendBookingConfirmation(booking) {
  const when = `${formatDate(booking.date)} at ${booking.time}`;
  const guests = booking.partySize === 1 ? '1 guest' : `${booking.partySize} guests`;
  const subject = `Your table at ${SHOP_NAME}`;
  const text = `Hi ${booking.name},\n\nYour table for ${guests} is booked for ${when}.\nWe look forward to seeing you!\n\n${SHOP_NAME}`;
  const html = `<p>Hi ${escapeHtml(booking.name)},</p><p>Your table for <strong>${guests}</strong> is booked for <strong>${when}</strong>.</p><p>We look forward to seeing you!</p><p>${SHOP_NAME}</p>`;

  if (!transport) {
    console.log(`[mail] SMTP_URL is not set, so this email was not sent:\nTo: ${booking.email}\nSubject: ${subject}\n\n${text}\n`);
    return { sent: false };
  }
  await transport.sendMail({ from, to: booking.email, subject, text, html });
  return { sent: true };
}
